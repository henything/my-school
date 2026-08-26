# 13_TECH_STACK_DECISIONS.md

# Азбука движения - технологический стек и архитектурные решения

**Проект:** Азбука движения  
**Бизнес:** Азбука движения  
**Тип документа:** Tech Stack Decision / Architecture Decision Record  
**Версия:** v1.0  
**Дата решения:** 2026-06-03  
**Статус:** принято для DEV-00 и MVP v1  

---

## 1. Назначение

Этот документ фиксирует технологический стек Азбука движения до начала реализации DEV-00.

Цель решения: выбрать стек, который лучше всего поддерживает требования документов проекта:

- web + desktop + mobile web;
- mobile-friendly интерфейс тренера;
- PostgreSQL-oriented data model;
- Prisma-compatible schema;
- login/password auth без родительского кабинета;
- жёсткий RBAC и backend guards;
- audit log для критичных действий;
- scheduled jobs для задач в 22:00 и follow-up;
- безопасный Excel import с validation/preview/confirm;
- будущую SaaS-готовность без multi-school UI в v1.

---

## 2. Итоговое решение

Для MVP v1 выбираем один Docker-first fullstack web app:

```text
Next.js App Router + React + TypeScript
PostgreSQL
Prisma ORM
Custom DB-backed auth
Tailwind CSS + shadcn/ui + Radix primitives + lucide-react
Vitest + Playwright
Docker Compose for local infra
Docker-compatible deployment target
```

Это решение заменяет прежнюю формулировку "Next.js / React fullstack, PostgreSQL, Prisma" из `12_DEVELOPMENT_SPECS_RU.md` на конкретный стек и набор инженерных правил.

---

## 3. Почему этот стек подходит проекту

| Требование проекта | Решение в стеке | Причина |
|---|---|---|
| Внутренний web-сервис | Next.js fullstack | один repo и один deployable app вместо раннего разделения frontend/backend |
| Admin desktop + coach mobile web | React + responsive UI | один UI stack покрывает оба интерфейса |
| Mobile-friendly тренерский экран | Tailwind + shadcn/ui primitives | быстрые доступные компоненты, крупные controls, predictable layout |
| PostgreSQL-oriented модель | PostgreSQL | документы прямо проектируют таблицы, индексы и транзакции под PostgreSQL |
| Prisma-like data model | Prisma ORM | `06_DATA_MODEL_RU.md` уже написан в стиле Prisma/PostgreSQL |
| Балансы через транзакции | Prisma transactions + service layer | все изменения баланса проходят через application service в DB transaction |
| Жёсткий RBAC | server-side guards + serializers | UI скрывает кнопки, но безопасность живёт на backend |
| COACH не видит финансы | role-aware API serializers | финансовые поля не возвращаются из API для coach |
| Audit log обязателен | `AuditLogService` | единая точка записи критичных изменений |
| Внутренние задачи вместо уведомлений | `TaskService` + scheduler | без отдельного notification engine в v1 |
| Excel import | ExcelJS + validation pipeline | `.xlsx`, validation-first, preview-before-write |
| Локальная разработка | Docker Compose | PostgreSQL и app окружение воспроизводимы |
| Надёжность | managed PostgreSQL backups | attendance/balance данные нельзя терять |

---

## 4. Runtime и package manager

### 4.1 Node.js

Выбираем:

```text
Node.js 24 LTS
```

Причина:

- на 2026-06-03 Node.js 24 является LTS-линейкой;
- Next.js официально требует минимум Node.js 20.9;
- Playwright поддерживает Node.js 20/22/24;
- Node.js 24 даёт запас поддержки для нового проекта.

Для DEV-00 добавить в `package.json`:

```json
{
  "engines": {
    "node": ">=24 <25"
  }
}
```

### 4.2 Package manager

Выбираем:

```text
pnpm через Corepack
```

Причина:

- быстрые installs;
- строгий lockfile;
- хорошая поддержка workspaces, если позже появятся отдельные packages;
- меньше случайных расхождений зависимостей между разработчиками.

Для DEV-00 добавить в `package.json`:

```json
{
  "packageManager": "pnpm@latest"
}
```

При реализации точную версию `pnpm` нужно закрепить lockfile-ом, а не оставлять floating в готовом `package.json`.

---

## 5. Frontend stack

Выбираем:

```text
Next.js App Router
React
TypeScript strict
Tailwind CSS
shadcn/ui
Radix primitives
lucide-react
```

DEV-00 implementation note:

- use Tailwind CSS 3.x with standard PostCSS/Autoprefixer pipeline;
- avoid Tailwind 4 `oxide` in the first block because local macOS native bindings are currently blocked by code-signing checks in this workspace;
- keep shadcn-compatible component structure, Radix primitives and lucide icons.

Правила реализации:

1. Admin UI должен быть плотным operational dashboard, не landing page.
2. Coach UI должен быть mobile-first.
3. Запрещённые действия скрываются в UI, но backend всё равно проверяет права.
4. Coach UI не рендерит финансовые блоки вообще.
5. Статусы `ADMITTED`, `CREDIT_LESSON_USED`, `NOT_ADMITTED` должны иметь устойчивые visual tokens.
6. Использовать lucide icons для navigation/actions.
7. Не строить hero/marketing UI внутри продукта.

Почему не отдельный SPA:

- серверные guards, session и data fetching проще держать рядом с backend;
- MVP меньше по объёму;
- admin/coach UI зависит от server-side role context.

---

## 6. Backend stack

Выбираем backend внутри Next.js:

```text
Next.js Route Handlers
Server Actions where useful
Service layer in src/server/*
Prisma Client
Zod validation
```

Правила реализации:

1. Вся бизнес-логика живёт в service layer, не в React components.
2. Route Handlers вызывают services и guards.
3. Server Actions допустимы для простых форм, но не должны обходить guards/services.
4. Все входные payload валидируются Zod-схемами.
5. Все role-specific responses проходят через serializers.

Структура DEV-00:

```text
src/app/*
src/app/api/*
src/server/auth/*
src/server/rbac/*
src/server/audit/*
src/server/db/*
src/server/users/*
src/lib/*
prisma/*
```

---

## 7. Database и ORM

Выбираем:

```text
PostgreSQL 16+
Prisma ORM
Prisma migrations
```

Локальная разработка:

```text
Docker Compose service: postgres
```

Production:

```text
managed PostgreSQL with automated daily backups
```

Правила данных:

1. UUID для основных сущностей.
2. Все суммы хранить integer kopeks.
3. `school_id` в ключевых таблицах, но без выбора школы в UI v1.
4. Soft delete / archive вместо hard delete.
5. Баланс через `lesson_balance_transactions`.
6. Cached balance fields обновляются только в одной DB transaction с balance transaction.
7. `audit_logs` append-only: нельзя редактировать и удалять в v1.
8. Индексы из `06_DATA_MODEL_RU.md` должны попасть в migrations по мере появления таблиц.

Почему не SQLite:

- требования к транзакционным балансам, индексам, concurrency и будущей SaaS-готовности лучше закрывает PostgreSQL;
- data model уже PostgreSQL-oriented;
- SQLite демо быстрее, но повышает риск расхождения DEV и production.

---

## 8. Auth и RBAC

Выбираем:

```text
Custom DB-backed login/password auth
Opaque session tokens in httpOnly cookies
Argon2id password hashing
Server-side RBAC guards
```

DEV-00 implementation note:

- Argon2id is implemented through `hash-wasm` and stores standard encoded `$argon2id$...` hashes;
- this avoids native `.node` binding failures on the current macOS workspace while keeping the selected password hashing algorithm.

Почему не Auth.js/NextAuth в DEV-00:

- v1 не требует OAuth, email magic links, social login или parent login;
- роли и ограничения проекта очень доменные;
- custom DB-backed sessions проще проверить и полностью контролировать;
- меньше риска случайно протащить лишние auth-функции в UI.

Минимальная модель:

```text
users
sessions
admin_profiles
coach_profiles
audit_logs
```

Auth rules:

1. Login только по вручную созданному login/password.
2. Пароль хранится только как Argon2id hash.
3. Session cookie: `httpOnly`, `sameSite=Lax`, `secure` в production.
4. На каждый request проверяется активность пользователя.
5. `INACTIVE` пользователь не входит и теряет доступ при следующей проверке session.

RBAC rules:

1. Guards на backend обязательны.
2. UI не является security boundary.
3. Coach scope для lesson:

```text
lesson.coach_id = current_coach.id
OR lesson.substitute_coach_id = current_coach.id
```

4. Coach API не возвращает financial fields.
5. `NOT_ADMITTED` нельзя обойти через прямой API request.

---

## 9. Audit log

Выбираем:

```text
Application-level AuditLogService
```

Формат:

```text
actor_user_id
school_id
action
entity_type
entity_id
old_value JSONB
new_value JSONB
comment
created_at
```

Правила:

1. Audit пишется в той же transaction, что и критичное изменение, когда это возможно.
2. Audit append-only.
3. Coach не видит audit log.
4. Для DEV-00 нужен базовый service и таблица, даже если событий пока мало.

Почему не DB triggers в v1:

- бизнес-события доменные, не только row-level;
- проще писать понятные audit records из service layer;
- меньше скрытой магии на старте.

---

## 10. Tasks, scheduler и background jobs

Выбираем:

```text
TaskService + idempotent job functions
Cron-triggered protected route / CLI script
```

DEV-00 должен только заложить место под jobs. Полная реализация задач начинается позже.

Правила:

1. Job functions должны быть idempotent.
2. Production trigger защищён `CRON_SECRET`.
3. Локально jobs запускаются командой из `package.json`.
4. Task dedupe позже реализуется в `TaskService`.

Почему не отдельная queue в v1:

- объём v1 небольшой: десятки занятий в день, не тысячи;
- критичные jobs простые и периодические;
- Redis/BullMQ можно добавить позже, если появятся реальные async workloads.

---

## 11. Excel import stack

Выбираем:

```text
ExcelJS
Zod validation
Prisma transaction for confirmed import
```

Правила:

1. `.xlsx` only.
2. Validation-only endpoint сначала.
3. Preview обязателен перед DB write.
4. Confirmed import create-only.
5. Critical errors block import.
6. Unknown columns are warnings.
7. Uploaded source file не хранить постоянно в v1.

Почему не custom CSV parser:

- источник данных описан как один `.xlsx` с несколькими листами;
- связи между листами проще валидировать в workbook model.

---

## 12. Testing stack

Выбираем:

```text
Vitest
Testing Library
Playwright
Prisma test database
```

Тестовые уровни:

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | services, guards, serializers, validation |
| Component | Testing Library | role-specific UI pieces where useful |
| Integration | Vitest + Prisma test DB | auth, sessions, audit, business services |
| E2E | Playwright | login, role routing, admin/coach shell, forbidden flows |

CI minimum после DEV-00:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Playwright становится обязательным после появления первого UI login flow.

---

## 13. Deployment decision

Выбираем:

```text
Docker-compatible Node deployment
Managed PostgreSQL
```

Recommended default:

```text
Render Web Service + Render PostgreSQL
```

Допустимые альтернативы:

```text
Fly.io app + managed/external PostgreSQL
Railway app + PostgreSQL
VPS Docker Compose + managed backups
```

Почему не Vercel как default:

- проекту нужны scheduled jobs, Prisma/PostgreSQL connections, Excel processing и predictable server behavior;
- Vercel возможен позже, но потребует аккуратно решить connection pooling and cron;
- Docker-first deployment ближе к локальной среде и снижает расхождение dev/prod.

Production requirements:

1. HTTPS only.
2. Managed PostgreSQL daily backups.
3. Separate production `DATABASE_URL`.
4. `SESSION_SECRET` and `CRON_SECRET`.
5. Error logs visible to developer/admin.
6. No public access to data without auth.

---

## 14. CI/CD

Выбираем:

```text
GitHub Actions
```

Required jobs:

```text
install
prisma validate
lint
typecheck
unit/integration tests
build
```

Playwright CI добавляется после login UI:

```text
playwright install --with-deps
playwright test
```

Deploy should be manual or protected until pilot readiness.

---

## 15. Observability and backups

DEV-00:

- structured server logs;
- clear auth/audit errors;
- no PII in logs.

Before pilot:

- Sentry or equivalent error reporting;
- managed PostgreSQL daily backups;
- documented restore drill;
- admin-visible audit log.

Why:

- attendance and balance data are operational source of truth;
- lost data is worse than a failed deploy.

---

## 16. Explicit non-decisions

These are intentionally not part of DEV-00:

| Topic | Decision |
|---|---|
| Parent cabinet | out of v1 |
| Parent auth | out of v1 |
| Online payment | out of v1 |
| External notifications | out of v1 |
| Native mobile app | out of v1 |
| Multi-school UI | out of v1 |
| Queue/Redis | defer until real async workload appears |
| Payroll/accounting | out of v1 |
| File storage for certificates/vacations | out of v1 |

---

## 17. DEV-00 implementation constraints

DEV-00 must implement only foundation:

```text
Next.js app shell
PostgreSQL/Prisma setup
User/School/AdminProfile/CoachProfile/AuditLog/Session
login/logout
seed SUPER_ADMIN
role routing
admin empty dashboard
coach empty mobile shell
backend guards
basic AuditLogService
tests for auth/RBAC/audit basics
```

DEV-00 must not implement:

```text
children
groups
schedule
attendance
subscriptions
balances
makeups
trials
Excel import
external notifications
parent flows
payment flows
```

---

## 18. Setup prerequisites for developers

Required local tools:

```text
Node.js 24 LTS with Corepack
pnpm pinned by packageManager
Docker Desktop or Colima
Git
```

Before implementation, verify:

```bash
node --version
corepack --version
pnpm --version
docker --version
```

Current Codex machine note on 2026-06-03:

```text
Node.js exists: v24.14.0
npm is missing
pnpm is missing
yarn is missing
docker is missing
```

So DEV-00 setup must not assume that package manager or Docker are already installed on this machine.

---

## 19. External references checked

Official references used for runtime/test decisions:

- Node.js releases: https://nodejs.org/tr/download/releases
- Next.js installation docs: https://nextjs.org/docs/pages/getting-started/installation
- Prisma + Next.js docs: https://www.prisma.io/docs/guides/nextjs
- Playwright docs: https://playwright.dev/docs/next/intro

Project references:

- `01_PRD_V1_RU.md` section 15: platform, performance, security, reliability.
- `06_DATA_MODEL_RU.md` section 2: PostgreSQL, Prisma, money in kopeks, transactions, audit.
- `07_UI_SPEC_RU.md`: admin/coach layouts and mobile requirements.
- `08_TASKS_AND_NOTIFICATIONS_RU.md`: scheduled tasks and task service.
- `09_EXCEL_IMPORT_SPEC_RU.md`: `.xlsx` validation and preview flow.
- `11_ROADMAP_RU.md` Phase 0/1: recommended stack and foundation scope.
- `12_DEVELOPMENT_SPECS_RU.md` DEV-00: first implementation block.

---

## 20. Final stack summary

```text
Language: TypeScript strict
Runtime: Node.js 24 LTS
Package manager: pnpm via Corepack
App framework: Next.js App Router
UI: React + Tailwind CSS 3 + shadcn/ui-compatible components + Radix + lucide-react
Backend: Next.js Route Handlers + service layer
Validation: Zod
Database: PostgreSQL 16+
ORM: Prisma
Auth: custom DB-backed sessions + Argon2id via hash-wasm
RBAC: server-side guards + role-aware serializers
Audit: application-level AuditLogService
Jobs: idempotent job functions + protected cron trigger
Excel: ExcelJS validation/preview/confirm
Tests: Vitest + Testing Library + Playwright
Local infra: Docker Compose
Deploy: Docker-compatible Node service + managed PostgreSQL
CI/CD: GitHub Actions
```

DEV-00 local toolchain note:

```text
next dev --webpack
next build --webpack
```

The current local macOS environment rejects several downloaded native bindings by code signature. Webpack + WASM fallbacks keep local development and CI commands reproducible without changing the product architecture.
