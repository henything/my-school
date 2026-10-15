#!/usr/bin/env bash
set -Eeuo pipefail

HOST="${AZBUKA_STAGE_HOST:-azbuka-prod}"
DOMAIN="${AZBUKA_STAGE_DOMAIN:-test.195.133.56.68.sslip.io}"
CONTROL_PATH="/tmp/azbuka-stage-setup-$$"

cleanup() { ssh -o ControlPath="$CONTROL_PATH" -O exit "$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for attempt in {1..10}; do
  if ssh -MNf -o BatchMode=yes -o ConnectTimeout=10 -o ControlMaster=yes \
    -o ControlPath="$CONTROL_PATH" -o ControlPersist=10m "$HOST" 2>/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then echo "Could not connect to $HOST" >&2; exit 1; fi
  sleep 5
done

ssh -o ControlPath="$CONTROL_PATH" "$HOST" "STAGE_DOMAIN='$DOMAIN' bash -s" <<'REMOTE'
set -Eeuo pipefail

APP_DIR=/var/www/azbuka-staging
APP_USER=azbukastage
DB_NAME=azbuka_stage
DOMAIN="$STAGE_DOMAIN"

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_NAME'" | grep -q 1; then
    echo "Database role exists but staging .env is missing; refusing to replace its password." >&2
    exit 1
  fi
  DB_PASSWORD=$(openssl rand -hex 24)
  SESSION_SECRET=$(openssl rand -hex 32)
  CRON_SECRET=$(openssl rand -hex 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_NAME LOGIN PASSWORD '$DB_PASSWORD'" >/dev/null
  sudo -u postgres createdb -O "$DB_NAME" "$DB_NAME"
  cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="postgresql://$DB_NAME:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public"
SESSION_SECRET="$SESSION_SECRET"
CRON_SECRET="$CRON_SECRET"
APP_BASE_URL="https://$DOMAIN"
NEXT_PUBLIC_APP_URL="https://$DOMAIN"
YOOKASSA_SHOP_ID=""
YOOKASSA_SECRET_KEY=""
ENV
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 0600 "$APP_DIR/.env"
fi

cat > /etc/systemd/system/azbuka-staging.service <<UNIT
[Unit]
Description=Azbuka staging Next.js app
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOSTNAME=127.0.0.1
Environment=PATH=/opt/node-v24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=$APP_DIR/.env
ExecStart=/opt/node-v24/bin/pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
install -d -m 0755 /var/www/letsencrypt/.well-known/acme-challenge

cat > /etc/nginx/sites-available/azbuka-staging <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 404; }
}
NGINX
ln -sfn /etc/nginx/sites-available/azbuka-staging /etc/nginx/sites-enabled/azbuka-staging
nginx -t
systemctl reload nginx

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

cat > /etc/nginx/sites-available/azbuka-staging <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    client_max_body_size 20m;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
nginx -t
systemctl reload nginx
echo "Staging infrastructure ready: https://$DOMAIN"
REMOTE
