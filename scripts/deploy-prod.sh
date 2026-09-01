#!/usr/bin/env bash
set -Eeuo pipefail

HOST="${AZBUKA_DEPLOY_HOST:-azbuka-prod}"
APP_DIR="${AZBUKA_DEPLOY_APP_DIR:-/var/www/azbuka-dvizheniya}"
HEALTH_URL="${AZBUKA_PROD_HEALTH_URL:-https://azbukadvizheniya.ru/login}"
CONTROL_PATH="${AZBUKA_SSH_CONTROL_PATH:-/tmp/azbuka-prod-ctl-$$}"
SSH_ATTEMPTS="${AZBUKA_SSH_ATTEMPTS:-10}"
SSH_SLEEP_SECONDS="${AZBUKA_SSH_SLEEP_SECONDS:-5}"

RUN_PRECHECK=1
RUN_GIT_CHECK=1
RUN_SYNC=1
RUN_SERVER_BUILD=1
RUN_BACKUP=1
RUN_MIGRATE_RESTART=1
RUN_HEALTH=1
STATUS_ONLY=0
HEALTH_ONLY=0

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-prod.sh [options]

Deploy the current main branch to azbukadvizheniya.ru.

Options:
  --skip-precheck      Skip local lint/typecheck/test/build.
  --skip-git-check     Allow deploy when local main is dirty or not pushed.
  --skip-backup        Skip the production database backup.
  --status-only        Only check the production systemd helper.
  --health-only        Only check the public health URL.
  --host HOST          SSH host alias. Default: azbuka-prod.
  --app-dir PATH       Remote app directory. Default: /var/www/azbuka-dvizheniya.
  --url URL            Public health URL. Default: https://azbukadvizheniya.ru/login.
  -h, --help           Show this help.
USAGE
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-precheck)
      RUN_PRECHECK=0
      ;;
    --skip-git-check)
      RUN_GIT_CHECK=0
      ;;
    --skip-backup)
      RUN_BACKUP=0
      ;;
    --status-only)
      STATUS_ONLY=1
      RUN_PRECHECK=0
      RUN_GIT_CHECK=0
      RUN_SYNC=0
      RUN_SERVER_BUILD=0
      RUN_BACKUP=0
      RUN_MIGRATE_RESTART=0
      RUN_HEALTH=0
      ;;
    --health-only)
      HEALTH_ONLY=1
      RUN_PRECHECK=0
      RUN_GIT_CHECK=0
      RUN_SYNC=0
      RUN_SERVER_BUILD=0
      RUN_BACKUP=0
      RUN_MIGRATE_RESTART=0
      RUN_HEALTH=1
      ;;
    --host)
      [ "$#" -ge 2 ] || fail "--host requires a value"
      HOST="$2"
      shift
      ;;
    --app-dir)
      [ "$#" -ge 2 ] || fail "--app-dir requires a value"
      APP_DIR="$2"
      shift
      ;;
    --url)
      [ "$#" -ge 2 ] || fail "--url requires a value"
      HEALTH_URL="$2"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

if [ "$HEALTH_ONLY" -eq 1 ] && [ "$STATUS_ONLY" -eq 1 ]; then
  fail "--health-only and --status-only cannot be combined"
fi

ensure_control_connection() {
  if ssh -o BatchMode=yes -o ControlPath="$CONTROL_PATH" -O check "$HOST" >/dev/null 2>&1; then
    return 0
  fi

  local attempt
  attempt=1
  while [ "$attempt" -le "$SSH_ATTEMPTS" ]; do
    log "Opening SSH control connection to $HOST (attempt $attempt/$SSH_ATTEMPTS)"
    if ssh -MNf \
      -o ControlMaster=yes \
      -o ControlPath="$CONTROL_PATH" \
      -o ControlPersist=10m \
      -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=2 \
      "$HOST" 2>/dev/null; then
      if ssh -o ControlPath="$CONTROL_PATH" "$HOST" 'true' >/dev/null 2>&1; then
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep "$SSH_SLEEP_SECONDS"
  done

  fail "Could not open SSH connection to $HOST"
}

ssh_prod() {
  local attempt
  attempt=1
  while [ "$attempt" -le 2 ]; do
    ensure_control_connection
    if ssh -o ControlPath="$CONTROL_PATH" "$HOST" "$@"; then
      return 0
    fi
    log "SSH command failed, retrying once"
    attempt=$((attempt + 1))
    sleep "$SSH_SLEEP_SECONDS"
  done

  return 1
}

close_control_connection() {
  ssh -o ControlPath="$CONTROL_PATH" -O exit "$HOST" >/dev/null 2>&1 || true
}

trap close_control_connection EXIT

git_check() {
  log "Checking git state"
  local branch
  branch="$(git branch --show-current)"
  [ "$branch" = "main" ] || fail "Deploy from main, current branch is $branch. Use --skip-git-check only for emergency manual deploys."

  git fetch origin main >/dev/null 2>&1 || fail "Could not fetch origin/main"
  [ -z "$(git status --porcelain)" ] || fail "Working tree is not clean. Commit and push first, or use --skip-git-check."

  local local_head
  local remote_head
  local_head="$(git rev-parse HEAD)"
  remote_head="$(git rev-parse origin/main)"
  [ "$local_head" = "$remote_head" ] || fail "Local main is not equal to origin/main. Push first, or use --skip-git-check."
}

precheck() {
  log "Running local pre-deploy checks"
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
}

sync_source() {
  log "Syncing source to $HOST:$APP_DIR"
  local attempt
  attempt=1
  while [ "$attempt" -le "$SSH_ATTEMPTS" ]; do
    ensure_control_connection
    if rsync -az --delete \
      --exclude='.git/' \
      --exclude='node_modules/' \
      --exclude='.next/' \
      --exclude='.env' \
      --exclude='.cache/' \
      --exclude='.config/' \
      --exclude='.local/' \
      --exclude='.local-backups/' \
      --exclude='.gstack/' \
      --exclude='test-results/' \
      --exclude='tsconfig.tsbuildinfo' \
      --exclude='.DS_Store' \
      -e "ssh -o ControlPath=$CONTROL_PATH" \
      --rsync-path="sudo -u \$(stat -c %U \$(readlink -f '$APP_DIR')) /usr/bin/rsync" \
      ./ "$HOST:$APP_DIR/"; then
      return 0
    fi
    log "rsync failed, retrying ($attempt/$SSH_ATTEMPTS)"
    attempt=$((attempt + 1))
    sleep "$SSH_SLEEP_SECONDS"
  done

  fail "Source sync failed"
}

server_build() {
  log "Installing dependencies and building on production"
  ssh_prod "APP_DIR='$APP_DIR' bash -s" <<'REMOTE'
set -Eeuo pipefail
APP_USER=$(stat -c %U "$(readlink -f "$APP_DIR")")
cd "$APP_DIR"
sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm install --frozen-lockfile
sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm build
REMOTE
}

backup_database() {
  log "Backing up production database"
  ssh_prod "APP_DIR='$APP_DIR' bash -s" <<'REMOTE'
set -Eeuo pipefail
set -a
. "$APP_DIR/.env"
set +a
mkdir -p /var/backups/azbuka-dvizheniya
DB_URL="${DATABASE_URL%%\?schema=*}"
BACKUP="/var/backups/azbuka-dvizheniya/db-before-deploy-$(date +%Y%m%d_%H%M%S).dump"
pg_dump "$DB_URL" -Fc -f "$BACKUP"
echo "backup:$BACKUP"
REMOTE
}

migrate_and_restart() {
  log "Applying migrations and restarting service"
  ssh_prod "APP_DIR='$APP_DIR' bash -s" <<'REMOTE'
set -Eeuo pipefail
APP_USER=$(stat -c %U "$(readlink -f "$APP_DIR")")
cd "$APP_DIR"
sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin pnpm exec prisma migrate deploy
azbuka-dvizheniya-restart
REMOTE
}

status_check() {
  log "Checking production service status"
  ssh_prod 'azbuka-dvizheniya-status'
}

health_check() {
  log "Checking public health URL: $HEALTH_URL"
  local attempt
  local code
  attempt=1
  while [ "$attempt" -le 20 ]; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
    if [ "$code" = "200" ]; then
      log "Health check passed: $code"
      return 0
    fi
    log "Health check returned ${code:-no-response}, retrying ($attempt/20)"
    attempt=$((attempt + 1))
    sleep 3
  done

  fail "Health check failed for $HEALTH_URL"
}

if [ "$STATUS_ONLY" -eq 1 ]; then
  status_check
  exit 0
fi

if [ "$HEALTH_ONLY" -eq 1 ]; then
  health_check
  exit 0
fi

if [ "$RUN_GIT_CHECK" -eq 1 ]; then
  git_check
fi

if [ "$RUN_PRECHECK" -eq 1 ]; then
  precheck
fi

if [ "$RUN_SYNC" -eq 1 ]; then
  sync_source
fi

if [ "$RUN_SERVER_BUILD" -eq 1 ]; then
  server_build
fi

if [ "$RUN_BACKUP" -eq 1 ]; then
  backup_database
fi

if [ "$RUN_MIGRATE_RESTART" -eq 1 ]; then
  migrate_and_restart
fi

status_check

if [ "$RUN_HEALTH" -eq 1 ]; then
  health_check
fi

log "Deploy complete"
