#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then echo 'Нужен root.' >&2; exit 1; fi
SITE=/etc/nginx/sites-enabled/my-school
ZONE=/etc/nginx/conf.d/azbuka-join-rate-limit.conf
BACKUP="${SITE}.before-join-$(date +%Y%m%d_%H%M%S)"
cp -p "$SITE" "$BACKUP"
if [ ! -f "$ZONE" ]; then
  printf '%s\n' 'limit_req_zone $binary_remote_addr zone=azbuka_join:10m rate=6r/m;' > "$ZONE"
fi
python3 - "$SITE" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
marker = '    # azbuka-join-rate-limit'
if marker in text:
    raise SystemExit(0)
target = '    location / {\n'
if text.count(target) != 1:
    raise SystemExit('Не найден единственный основной location; конфигурация не изменена.')
blocks = marker + '\n'
for route in ('/api/join/signup', '/api/join/register'):
    blocks += f'''    location = {route} {{
        limit_req zone=azbuka_join burst=6 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
'''
path.write_text(text.replace(target, blocks + '\n' + target, 1))
PY
if ! nginx -t; then
  cp -p "$BACKUP" "$SITE"
  nginx -t
  echo 'Конфигурация отклонена и восстановлена.' >&2
  exit 1
fi
systemctl reload nginx
echo 'Ограничение частоты регистрации и записи включено.'
