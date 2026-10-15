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
read -r -p 'ID организации F.Doc (corpId): ' FDOC_CORP_ID
read -r -p 'Логин технической учётной записи F.Doc: ' FDOC_TECH_LOGIN
read -r -s -p 'Пароль технической учётной записи F.Doc: ' FDOC_TECH_PASSWORD
echo
read -r -p 'ID сотрудника F.Doc (employeeInitiator): ' FDOC_EMPLOYEE_ID
read -r -p 'Код приложения F.Doc (app), если известен [API]: ' FDOC_APP_CODE
FDOC_APP_CODE="${FDOC_APP_CODE:-API}"

export FDOC_API_KEY FDOC_CORP_ID FDOC_TECH_LOGIN FDOC_TECH_PASSWORD FDOC_EMPLOYEE_ID FDOC_APP_CODE
python3 - "$ENV_FILE" <<'PY'
import os, pathlib, shlex, sys, tempfile

path = pathlib.Path(sys.argv[1])
keys = ('FDOC_API_KEY', 'FDOC_CORP_ID', 'FDOC_TECH_LOGIN', 'FDOC_TECH_PASSWORD', 'FDOC_EMPLOYEE_ID', 'FDOC_APP_CODE')
values = {key: os.environ[key].strip() for key in keys}
if any(not value or '\n' in value or '\r' in value for value in values.values()):
    raise SystemExit('Все пять значений обязательны и должны помещаться в одну строку.')
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
print('Настройки F.Doc сохранены на тестовом сервере. Отправка документов пока выключена.')
PY
unset FDOC_API_KEY FDOC_CORP_ID FDOC_TECH_LOGIN FDOC_TECH_PASSWORD FDOC_EMPLOYEE_ID FDOC_APP_CODE
