#!/usr/bin/env bash
set -Eeuo pipefail

HOST="${AZBUKA_STAGE_HOST:-azbuka-prod}"
DOMAIN="${AZBUKA_STAGE_DOMAIN:-test.195.133.56.68.sslip.io}"
APP_DIR=/var/www/azbuka-staging
CONTROL_PATH="/tmp/azbuka-stage-deploy-$$"

cleanup() { ssh -o ControlPath="$CONTROL_PATH" -O exit "$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ "${1:-}" != "--skip-precheck" ]; then
  DATABASE_URL=postgresql://localhost:5432/azbuka_stage_build pnpm db:generate
  pnpm lint
  pnpm typecheck
  pnpm test
fi

for attempt in {1..10}; do
  if ssh -MNf -o BatchMode=yes -o ConnectTimeout=10 -o ControlMaster=yes \
    -o ControlPath="$CONTROL_PATH" -o ControlPersist=10m "$HOST" 2>/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then echo "Could not connect to $HOST" >&2; exit 1; fi
  sleep 5
done

rsync -az --delete \
  --exclude='.git/' --exclude='node_modules/' --exclude='.next/' --exclude='.env' \
  --exclude='.cache/' --exclude='.config/' --exclude='.local/' \
  --exclude='test-results/' --exclude='tsconfig.tsbuildinfo' \
  -e "ssh -o ControlPath=$CONTROL_PATH" \
  --rsync-path="sudo -u azbukastage /usr/bin/rsync" \
  ./ "$HOST:$APP_DIR/"

ssh -o ControlPath="$CONTROL_PATH" "$HOST" "APP_DIR='$APP_DIR' bash -s" <<'REMOTE'
set -Eeuo pipefail
cd "$APP_DIR"
APP_USER=azbukastage
run_app() { sudo -u "$APP_USER" env HOME="$APP_DIR" PATH=/opt/node-v24/bin:/usr/local/bin:/usr/bin:/bin "$@"; }
run_app pnpm install --frozen-lockfile
run_app pnpm db:generate
run_app pnpm build
run_app pnpm exec prisma migrate deploy
if [ ! -f /root/azbuka-staging-initial-login ]; then
  PASSWORD=$(openssl rand -base64 30)
  run_app env STAGING_ADMIN_PASSWORD="$PASSWORD" pnpm exec tsx scripts/bootstrap-staging-admin.ts
  printf 'login=stage-admin\npassword=%s\n' "$PASSWORD" > /root/azbuka-staging-initial-login
  chmod 0600 /root/azbuka-staging-initial-login
fi
systemctl enable azbuka-staging.service
systemctl restart azbuka-staging.service
systemctl is-active --quiet azbuka-staging.service
REMOTE

for attempt in {1..12}; do
  status=$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$DOMAIN/login" || true)
  if [ "$status" = "200" ]; then
    echo "Staging ready: https://$DOMAIN/login"
    exit 0
  fi
  sleep 5
done
echo "Staging health check failed; last HTTP status: $status" >&2
exit 1
