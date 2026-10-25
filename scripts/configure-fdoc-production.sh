#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Запустите скрипт от root в консоли VDSina.' >&2
  exit 1
fi

ENV_FILE=/var/www/azbuka-dvizheniya/.env
if [ ! -f "$ENV_FILE" ]; then
  echo 'Настройки продового сервера не найдены.' >&2
  exit 1
fi

echo 'Рабочие данные F.Doc вводятся только здесь. Секреты и пароли не выводятся.'
read -r -p 'Рабочий адрес F.Doc, например https://...fdoc.ru: ' FDOC_BASE_URL
read -r -s -p 'Рабочий API Key: ' FDOC_API_KEY; echo
read -r -p 'ID организации (corpId): ' FDOC_CORP_ID
read -r -p 'Код приложения-инициатора: ' FDOC_APP_CODE
read -r -p 'Логин сотрудника: ' FDOC_EMPLOYEE_LOGIN
read -r -s -p 'Пароль сотрудника: ' FDOC_EMPLOYEE_PASSWORD; echo
read -r -p 'ID сотрудника-подписанта: ' FDOC_EMPLOYEE_ID
read -r -p 'ID рабочего шаблона договора: ' FDOC_CONTRACT_TEMPLATE_ID
read -r -p 'ID рабочего шаблона согласия: ' FDOC_CONSENT_TEMPLATE_ID
for key in \
  FDOC_CONTRACT_PARENT_NAME_PARAM_ID FDOC_CONTRACT_PARENT_PHONE_PARAM_ID \
  FDOC_CONTRACT_CHILD_NAME_PARAM_ID FDOC_CONTRACT_CHILD_BIRTH_PARAM_ID \
  FDOC_CONTRACT_GROUP_NAME_PARAM_ID FDOC_CONSENT_PARENT_NAME_PARAM_ID \
  FDOC_CONSENT_PARENT_PHONE_PARAM_ID; do
  read -r -p "$key: " "$key"
  export "$key"
done

export FDOC_BASE_URL FDOC_API_KEY FDOC_CORP_ID FDOC_APP_CODE FDOC_EMPLOYEE_LOGIN \
  FDOC_EMPLOYEE_PASSWORD FDOC_EMPLOYEE_ID FDOC_CONTRACT_TEMPLATE_ID FDOC_CONSENT_TEMPLATE_ID
python3 - "$ENV_FILE" <<'PY'
import base64, json, os, pathlib, secrets, shlex, sys, tempfile, urllib.error, urllib.request
from urllib.parse import urlparse

path = pathlib.Path(sys.argv[1])
keys = [
    'FDOC_BASE_URL', 'FDOC_API_KEY', 'FDOC_CORP_ID', 'FDOC_APP_CODE',
    'FDOC_EMPLOYEE_LOGIN', 'FDOC_EMPLOYEE_PASSWORD', 'FDOC_EMPLOYEE_ID',
    'FDOC_CONTRACT_TEMPLATE_ID', 'FDOC_CONSENT_TEMPLATE_ID',
    'FDOC_CONTRACT_PARENT_NAME_PARAM_ID', 'FDOC_CONTRACT_PARENT_PHONE_PARAM_ID',
    'FDOC_CONTRACT_CHILD_NAME_PARAM_ID', 'FDOC_CONTRACT_CHILD_BIRTH_PARAM_ID',
    'FDOC_CONTRACT_GROUP_NAME_PARAM_ID', 'FDOC_CONSENT_PARENT_NAME_PARAM_ID',
    'FDOC_CONSENT_PARENT_PHONE_PARAM_ID'
]
values = {key: os.environ.get(key, '').strip() for key in keys}
values['FDOC_BASE_URL'] = values['FDOC_BASE_URL'].rstrip('/')
if any(not value or '\n' in value or '\r' in value for value in values.values()):
    raise SystemExit('Все запрошенные значения обязательны; настройки не изменены.')
host = urlparse(values['FDOC_BASE_URL']).hostname
if not values['FDOC_BASE_URL'].startswith('https://') or not host or host == 'demo.fdoc.ru' or not (host == 'fdoc.ru' or host.endswith('.fdoc.ru')):
    raise SystemExit('Нужен рабочий HTTPS-адрес F.Doc, не DEMO; настройки не изменены.')
for key in keys:
    if key.endswith('_PARAM_ID') and (not values[key].isdigit() or int(values[key]) <= 0):
        raise SystemExit(f'{key}: нужен положительный числовой ID; настройки не изменены.')
url = values['FDOC_BASE_URL'].rstrip('/') + '/paperless-gateway/api/v1/operator/accessToken'
request = urllib.request.Request(url, data=json.dumps({
    'apiKey': values['FDOC_API_KEY'], 'corpId': values['FDOC_CORP_ID'],
    'app': values['FDOC_APP_CODE'], 'grantType': 'password',
    'grant': base64.b64encode(f"{values['FDOC_EMPLOYEE_LOGIN']}:{values['FDOC_EMPLOYEE_PASSWORD']}".encode()).decode()
}).encode(), headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        token = json.load(response).get('accessToken')
except urllib.error.HTTPError as error:
    raise SystemExit(f'F.Doc не принял рабочие реквизиты (HTTP {error.code}); настройки не изменены.') from None
except (urllib.error.URLError, TimeoutError):
    raise SystemExit('F.Doc не ответил; настройки не изменены.') from None
if not isinstance(token, str) or not token:
    raise SystemExit('F.Doc не выдал токен; настройки не изменены.')

original = path.read_text()
previous_token = None
for line in original.splitlines():
    if line.startswith('FDOC_WEBHOOK_TOKEN='):
        parts = shlex.split(line.split('=', 1)[1])
        if len(parts) == 1 and len(parts[0]) >= 32:
            previous_token = parts[0]
values.update({
    'FDOC_ENVIRONMENT': 'PRODUCTION', 'FDOC_MVP_ENABLED': 'true',
    'FDOC_PROD_ENABLED': 'true', 'FDOC_PUBLIC_BOOKING_ENABLED': 'false',
    'FDOC_REAL_DOCUMENTS': 'true',
    'FDOC_PILOT_GROUP_ID': 'c75009cb-8d22-4de1-b165-33db48ce7b11',
    'FDOC_SIGNED_FILES_DIR': '/var/lib/azbuka-dvizheniya/fdoc-signed',
    'FDOC_WEBHOOK_TOKEN': previous_token or secrets.token_urlsafe(48)
})
lines = [line for line in original.splitlines() if line.split('=', 1)[0] not in values]
lines.extend(f'{key}={shlex.quote(value)}' for key, value in values.items())
stat = path.stat()
with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.fdoc-production-', delete=False) as file:
    temp = pathlib.Path(file.name)
    file.write('\n'.join(lines) + '\n')
os.chown(temp, stat.st_uid, stat.st_gid)
os.chmod(temp, 0o600)
os.replace(temp, path)
print('Рабочий F.Doc подтвердил доступ. Публичная запись остаётся выключенной.')
PY

APP_USER=$(stat -c %U "$(readlink -f /var/www/azbuka-dvizheniya)")
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" /var/lib/azbuka-dvizheniya/fdoc-signed
azbuka-dvizheniya-restart
