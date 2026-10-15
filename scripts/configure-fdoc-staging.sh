#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Запустите этот скрипт от root в консоли VDSina.' >&2
  exit 1
fi

ENV_FILE=/var/www/azbuka-staging/.env
if [ ! -f "$ENV_FILE" ]; then
  echo 'Файл настроек тестового сервера не найден.' >&2
  exit 1
fi

echo 'Данные вводятся только в консоли сервера и не печатаются обратно.'
read -r -s -p 'Тестовый API Key F.Doc: ' FDOC_API_KEY
echo
read -r -p 'Логин Basic Auth для verifyApiKey [api_demo]: ' FDOC_BASIC_LOGIN
FDOC_BASIC_LOGIN="${FDOC_BASIC_LOGIN:-api_demo}"
read -r -s -p 'Пароль Basic Auth для verifyApiKey: ' FDOC_BASIC_PASSWORD
echo
read -r -p 'Логин сотрудника F.Doc [a.galemanov1]: ' FDOC_EMPLOYEE_LOGIN
FDOC_EMPLOYEE_LOGIN="${FDOC_EMPLOYEE_LOGIN:-a.galemanov1}"
read -r -s -p 'Пароль сотрудника F.Doc: ' FDOC_EMPLOYEE_PASSWORD
echo

export FDOC_API_KEY FDOC_BASIC_LOGIN FDOC_BASIC_PASSWORD FDOC_EMPLOYEE_LOGIN FDOC_EMPLOYEE_PASSWORD
python3 - "$ENV_FILE" <<'PY'
import base64, json, os, pathlib, shlex, sys, tempfile, urllib.error, urllib.parse, urllib.request

path = pathlib.Path(sys.argv[1])
input_keys = ('FDOC_API_KEY', 'FDOC_BASIC_LOGIN', 'FDOC_BASIC_PASSWORD', 'FDOC_EMPLOYEE_LOGIN', 'FDOC_EMPLOYEE_PASSWORD')
inputs = {key: os.environ[key].strip() for key in input_keys}
if any(not value or '\n' in value or '\r' in value for value in inputs.values()):
    raise SystemExit('Все значения обязательны и должны помещаться в одну строку.')
credentials = base64.b64encode(f"{inputs['FDOC_BASIC_LOGIN']}:{inputs['FDOC_BASIC_PASSWORD']}".encode()).decode()
url = 'https://demo.fdoc.ru/paperless-gateway/api/v1/verifyApiKey?' + urllib.parse.urlencode({'apiKey': inputs['FDOC_API_KEY']})
request = urllib.request.Request(url, headers={'Authorization': f'Basic {credentials}'})
try:
    with urllib.request.urlopen(request, timeout=15) as response:
        corp_id = json.load(response).get('corpId')
except urllib.error.HTTPError as error:
    try:
        message = json.load(error).get('message', '')
    except (ValueError, AttributeError):
        message = ''
    normalized = message.casefold()
    if 'api key' in normalized and ('не найден' in normalized or 'not found' in normalized):
        reason = 'API Key не найден у F.Doc. Проверьте, что взят ключ именно из письма/СМС для DEMO.'
    elif any(word in normalized for word in ('password', 'парол', 'login', 'логин', 'basic')):
        reason = 'Не принят логин или пароль Basic Auth приложения api_demo.'
    else:
        reason = 'Проверьте API Key и отдельный пароль Basic Auth для api_demo.'
    raise SystemExit(f'F.Doc отказал в авторизации (HTTP {error.code}). {reason}') from None
except (urllib.error.URLError, TimeoutError):
    raise SystemExit('Нет ответа от demo.fdoc.ru. Настройки не изменены.') from None
if not isinstance(corp_id, str) or not corp_id.strip():
    raise SystemExit('F.Doc не вернул corpId. Настройки не изменены.')
values = {
    'FDOC_API_KEY': inputs['FDOC_API_KEY'],
    'FDOC_CORP_ID': corp_id.strip(),
    'FDOC_EMPLOYEE_LOGIN': inputs['FDOC_EMPLOYEE_LOGIN'],
    'FDOC_EMPLOYEE_PASSWORD': inputs['FDOC_EMPLOYEE_PASSWORD'],
    'FDOC_APP_CODE': '532110981120',
}
keys = (*values.keys(), 'FDOC_TECH_LOGIN', 'FDOC_TECH_PASSWORD')
original = path.read_text()
lines = [line for line in original.splitlines() if line.split('=', 1)[0] not in keys]
lines.extend(f'{key}={shlex.quote(value)}' for key, value in values.items())
stat = path.stat()
with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.fdoc-env-', delete=False) as file:
    temp = pathlib.Path(file.name)
    file.write('\n'.join(lines) + '\n')
os.chown(temp, stat.st_uid, stat.st_gid)
os.chmod(temp, 0o600)
os.replace(temp, path)
print('F.Doc подтвердил API Key; corpId получен и настройки сохранены. Отправка документов пока выключена.')
PY
unset FDOC_API_KEY FDOC_BASIC_LOGIN FDOC_BASIC_PASSWORD FDOC_EMPLOYEE_LOGIN FDOC_EMPLOYEE_PASSWORD
