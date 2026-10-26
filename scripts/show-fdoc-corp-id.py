#!/usr/bin/env python3
"""Read the production F.Doc corpId without storing or displaying credentials."""

import base64
import getpass
import json
import urllib.error
import urllib.parse
import urllib.request


print("Получение corpId из рабочего F.Doc. Данные не сохраняются.")
api_key = getpass.getpass("Рабочий API Key: ").strip()
app_login = input("Логин приложения Basic Auth: ").strip()
app_password = getpass.getpass("Пароль приложения Basic Auth: ").strip()
if not api_key or not app_login or not app_password:
    raise SystemExit("Заполните все три значения из сообщения о ПРОМ-доступе.")

url = "https://fdoc.ru/paperless-gateway/api/v1/verifyApiKey?" + urllib.parse.urlencode(
    {"apiKey": api_key}
)
basic = base64.b64encode(f"{app_login}:{app_password}".encode()).decode()
request = urllib.request.Request(url, headers={"Authorization": f"Basic {basic}"})
try:
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f"F.Doc отказал в доступе (HTTP {error.code}). Проверьте рабочий API Key и пару Basic Auth.") from None
except (urllib.error.URLError, TimeoutError):
    raise SystemExit("Нет ответа от рабочего F.Doc. Попробуйте позже.") from None
except (ValueError, TypeError):
    raise SystemExit("F.Doc вернул неожиданный ответ.") from None

corp_id = payload.get("corpId") if isinstance(payload, dict) else None
if not isinstance(corp_id, str) or not corp_id.strip():
    raise SystemExit("F.Doc не вернул corpId. Обратитесь к представителю F.Doc.")
print(f"Ваш corpId: {corp_id.strip()}")
