#!/usr/bin/env python3
"""Display production F.Doc employee, template and parameter IDs without storing credentials."""

import base64
import getpass
import json
import urllib.error
import urllib.parse
import urllib.request


BASE = "https://fdoc.ru/paperless-gateway/api/v1"


def request_json(url, *, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"F.Doc отказал в доступе (HTTP {error.code}). Проверьте введённые данные.") from None
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit("Нет ответа от рабочего F.Doc. Попробуйте позже.") from None
    except (ValueError, TypeError):
        raise SystemExit("F.Doc вернул неожиданный ответ.") from None


def records(payload, name):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in (name, "items", "content", "data", "result"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


print("Просмотр ID рабочего F.Doc. Данные входа не сохраняются.")
api_key = getpass.getpass("Рабочий API Key: ").strip()
corp_id = input("corpId из предыдущей проверки: ").strip()
login = input("Логин сотрудника-руководителя: ").strip()
password = getpass.getpass("Пароль сотрудника-руководителя: ").strip()
if not all((api_key, corp_id, login, password)):
    raise SystemExit("Заполните все четыре значения.")

payload = request_json(
    f"{BASE}/operator/accessToken",
    body={
        "apiKey": api_key,
        "corpId": corp_id,
        "app": "532110981120",
        "grantType": "password",
        "grant": base64.b64encode(f"{login}:{password}".encode()).decode(),
    },
)
token = payload.get("accessToken") if isinstance(payload, dict) else None
if not isinstance(token, str) or not token:
    raise SystemExit("F.Doc не вернул токен. Проверьте corpId и данные сотрудника.")
token = token.removeprefix("Bearer ")
print("\nДоступ к рабочему F.Doc подтверждён.")

employees = records(request_json(f"{BASE}/corp/employees", token=token), "employees")
matches = []
for employee in employees:
    if not isinstance(employee, dict):
        continue
    values = [value for value in employee.values() if isinstance(value, str)]
    if login.casefold() in (value.casefold() for value in values):
        employee_id = employee.get("id") or employee.get("employeeId") or employee.get("externalId")
        if employee_id:
            matches.append(str(employee_id))
print("ID сотрудника-подписанта:", ", ".join(matches) if matches else "не найден автоматически; уточните у F.Doc")

templates = records(request_json(f"{BASE}/corp/templates", token=token), "templates")
active = [item for item in templates if isinstance(item, dict) and item.get("templateStatus") != "DELETED"]
print(f"\nРабочие шаблоны ({len(active)}):")
for template in active:
    template_id = template.get("templateExternalId")
    if not isinstance(template_id, str) or not template_id:
        continue
    print(f"\n{template.get('documentName', 'Без названия')} — ID шаблона: {template_id}")
    url = f"{BASE}/template?" + urllib.parse.urlencode({"templateExternalId": template_id})
    detail = request_json(url, token=token)
    parameters = detail.get("templateParams", []) if isinstance(detail, dict) else []
    for parameter in parameters if isinstance(parameters, list) else []:
        if isinstance(parameter, dict):
            print(f"  Поле: {parameter.get('name') or parameter.get('code') or 'без названия'} | ID: {parameter.get('id')}")
