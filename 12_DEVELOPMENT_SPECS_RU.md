# 12_DEVELOPMENT_SPECS.md

# My School - спецификации разработки продукта

**Проект:** My School  
**Бизнес:** Азбука движения  
**Тип документа:** Development Specifications / Backlog-ready specs  
**Версия:** draft v0.1  
**Дата формирования:** 2026-06-03  
**Основано на документах:** `00_PROJECT_BRIEF_RU.md` - `11_ROADMAP_RU.md`  
**Статус:** черновик для review перед созданием GitHub issues или стартом реализации  

---

## 1. Назначение

Этот документ превращает продуктовые документы My School в спецификации разработки, которые можно выдавать Codex, разработчику или команде как backlog-ready задачи.

Фокус v1: внутренняя операционная система для Азбуки движения, которая закрывает ежедневную цепочку:

```text
Филиал -> тренер -> группа -> ребёнок -> расписание -> занятие -> посещаемость -> списание / перенос / долг / допуск -> задача админу
```

Это не спецификация SaaS, родительского кабинета, оплаты или внешних уведомлений. Эти направления намеренно остаются за пределами v1.

---

## 2. Проверенное текущее состояние

Папка проекта сейчас содержит 12 markdown-документов и не содержит git-репозитория или исходного кода.

| Проверка | Результат |
|---|---|
| Документы проекта | 12 `.md` файлов |
| Общий объём документов | 19 777 строк |
| Acceptance criteria | 137 AC в `10_ACCEPTANCE_CRITERIA_RU.md` |
| User flows | 53 flow в `05_USER_FLOWS_RU.md` |
| Основные таблицы v1 | 20 таблиц в `06_DATA_MODEL_RU.md` |
| Статусы / enum | 23 enum-группы в `06_DATA_MODEL_RU.md` |
| Код приложения | не найден |
| Git repo | не найден |
| GitHub CLI | не найден, поэтому dedupe/file issue через `gh` пропущены |

Источник текущего состояния:

| Документ | Назначение для разработки |
|---|---|
| `00_PROJECT_BRIEF_RU.md` | продуктовый смысл, scope, non-goals, ключевые правила |
| `01_PRD_V1_RU.md` | PRD v1, роли, scope, метрики, milestones |
| `02_BUSINESS_RULES_RU.md` | бизнес-правила списаний, болезней, отпусков, переносов, задач |
| `03_DOMAIN_MODEL_RU.md` | доменные сущности, инварианты, события |
| `04_ROLES_AND_PERMISSIONS_RU.md` | RBAC, ограничения тренера, API visibility |
| `05_USER_FLOWS_RU.md` | 53 пользовательских и системных сценария |
| `06_DATA_MODEL_RU.md` | таблицы, поля, enum, ограничения, индексы |
| `07_UI_SPEC_RU.md` | admin/coach UI, статусы, формы, mobile requirements |
| `08_TASKS_AND_NOTIFICATIONS_RU.md` | Task model, task triggers, priorities, dedupe, texts |
| `09_EXCEL_IMPORT_SPEC_RU.md` | Excel import format, validation, preview, create-only import |
| `10_ACCEPTANCE_CRITERIA_RU.md` | проверяемые Given/When/Then критерии |
| `11_ROADMAP_RU.md` | порядок реализации, зависимости, release gates |

---

## 3. Phase 1: зачем это нужно

### 3.1 Кто затронут

| Роль | Что получает |
|---|---|
| SUPER_ADMIN | настройка системы, пользователи, Excel import, полный контроль |
| ADMIN | ежедневный операционный центр, дети, группы, расписание, балансы, переносы, задачи |
| COACH | телефонный интерфейс для своих занятий, посещаемости, допуска, пробников |
| Родители | не входят в систему v1, получают эффект косвенно через точный учёт и меньше хаоса |
| Бизнес | меньше ручного Excel/chat-контроля, меньше потерянных переносов, лучше контроль допуска |

### 3.2 Что происходит сейчас

Текущий бизнес работает через Excel, ручной контроль и коммуникацию вне системы. Документы фиксируют боли: посещаемость, абонементы, списания, болезни, отпуска, переносы, долги, допуск и нагрузка на админов.

### 3.3 Что должно быть вместо этого

Единая внутренняя web-система для операционного ядра школы:

- админ видит проблемные места дня в операционном центре;
- тренер с телефона видит свои занятия и отмечает табель;
- балансы меняются через транзакции;
- болезни/отпуска/карантины создают переносы;
- долг и `NOT_ADMITTED` видны и не обходятся тренером;
- внутренние уведомления реализованы как `Task`;
- критичные действия пишутся в `AuditLog`.

### 3.4 Почему сейчас

Это MVP v1 для уже работающего бизнеса с реальными детьми, группами, тренерами, оплатами и Excel-данными. Главная ставка v1 - убрать операционный хаос в ежедневном цикле занятий, а не строить CRM общего назначения.

### 3.5 Как понять, что готово

Главный критерий v1 из `10_ACCEPTANCE_CRITERIA_RU.md`:

```text
Создать филиал -> создать тренера -> создать группу -> добавить ребёнка -> создать расписание -> сгенерировать занятия -> тренер отмечает посещаемость -> система списывает занятие / создаёт перенос / контролирует долг / показывает допуск -> админ видит задачи и проблемы.
```

Главная метрика:

```text
95%+ занятий имеют заполненную посещаемость в день проведения.
```

Вторичные метрики:

- 100% переносов зафиксированы в системе;
- 0 потерянных переносов;
- 100% детей с долгом видны админу;
- 100% детей с `NOT_ADMITTED` видны тренеру;
- ручной контроль админа снижен минимум на 30%.

---

## 4. Scope v1

### 4.1 Входит в v1

| Блок | Краткое содержание |
|---|---|
| Auth/RBAC | логин/пароль, роли `SUPER_ADMIN`, `ADMIN`, `COACH`, активность пользователя |
| Core directories | филиалы, тренеры, родители, дети, группы |
| Schedule | шаблоны, генерация занятий, ручные занятия, переносы, отмены, замены |
| Attendance | экран занятия тренера, табель, статусы, audit, задача в 18:00 |
| Subscriptions/balances | абонементы, транзакции баланса, payment status, admission status, долг |
| Absences/makeups | болезнь, справка как статус, отпуск, карантин, события сада, переносы |
| Tasks/ops center | внутренние задачи, дедупликация, приоритеты, операционный центр |
| Trial lessons | пробники, тренерский блок, обработка админом, конвертация |
| Excel import | validation-only, preview, confirmed import, create-only |
| Audit log | критичные изменения, old/new values, actor, reason/comment |

### 4.2 Не входит в v1

Не реализовывать:

- родительский кабинет;
- родительский login;
- мобильные нативные приложения;
- онлайн-оплату;
- платёжного провайдера;
- онлайн-кассу;
- полноценную бухгалтерию;
- VK/Telegram/SMS/email/push уведомления;
- внутренний чат;
- хранение файлов справок;
- хранение файлов заявлений на отпуск;
- CRM для лидов;
- маркетинговые цепочки;
- payroll тренеров;
- публичный SaaS onboarding;
- multi-school UI;
- white-label.

---

## 5. Технические решения для стартовой реализации

Документы оставляют часть технических деталей открытыми. Чтобы разработка могла стартовать без зависания, этот spec принимает следующие решения по умолчанию. Их можно изменить до создания репозитория.

| Решение | Значение v1 |
|---|---|
| Стек | Next.js / React fullstack, PostgreSQL, Prisma, Docker для локального запуска |
| ID | UUID для основных сущностей |
| Auth | login/password, password hash, session/cookie auth, без social login |
| RBAC | backend guards обязательны, UI только скрывает недоступные действия |
| Балансы | application service создаёт транзакции и обновляет cached fields в одной transaction |
| Audit | application-level `AuditLogService`, без DB triggers в v1 |
| Tasks | `TaskService` с dedupe по `(type, related_entity_type, related_entity_id, status=open)` |
| Attendance save | для v1 табель считается завершённым только когда отмечены все дети занятия |
| Scheduler | application cron/job для 18:00, sickness follow-up, not admitted checks |
| Excel import | create-only, validation-first, preview-before-write, no upsert |
| School model | `school_id` в ключевых таблицах, без выбора школы в UI |

Если команда выбирает другой стек, сохранить доменные инварианты и AC-ID без изменений.

---

## 6. Глобальные инварианты

Эти правила важнее отдельных экранов. Нарушение любого пункта блокирует readiness v1.

1. `COACH` не видит финансовые детали ни в UI, ни в API.
2. `COACH` видит только свои занятия или занятия, где он назначен заменой.
3. `COACH` не может обойти `NOT_ADMITTED`.
4. Ребёнок не может состоять в двух активных группах.
5. Баланс занятий меняется только через `lesson_balance_transactions`.
6. Баланс занятий и баланс переносов разделены.
7. `Lesson.status` и `AttendanceRecord.status` не смешиваются.
8. Незаполненный табель после 18:00 создаёт задачи, но не создаёт массовые списания.
9. `ABSENT_SICK_PENDING` не списывает занятие до финализации админом.
10. Подтверждённая болезнь, отпуск, карантин или событие сада создают `MakeupCredit`.
11. Все уведомления v1 являются внутренними `Task`.
12. Задачи не дублируются, если уже есть открытая задача того же типа по той же сущности.
13. Изменение оплаты и ручная корректировка баланса требуют комментарий.
14. Все действия с деньгами, посещаемостью, переносами, расписанием и допуском пишутся в audit log.
15. Справки и заявления на отпуск не загружаются файлами.
16. Excel import не пишет данные без preview и подтверждения `SUPER_ADMIN`.
17. Non-goals v1 не появляются в navigation, API, UI settings или schema.

---

## 7. Dependency graph

```text
DEV-00 Foundation/Auth/RBAC
  -> DEV-01 Core Directories
      -> DEV-02 Schedule Engine
          -> DEV-03 Coach Attendance
              -> DEV-04 Subscriptions/Balances/Admission
                  -> DEV-05 Absences/Makeups/Group Events
                      -> DEV-06 Tasks/Operational Center
                          -> DEV-07 Trial Lessons
                              -> DEV-08 Excel Import
                                  -> DEV-09 RBAC/Audit Hardening
                                      -> DEV-10 Pilot/Readiness
```

Пояснение:

- Посещаемость нельзя делать без занятий.
- Списания нельзя делать без балансов.
- Переносы нельзя делать без посещаемости и причин отсутствия.
- Допуск нельзя делать без баланса и оплаты.
- Операционный центр полезен только когда есть источники задач.
- Excel import безопаснее делать после фиксации схемы core entities.

---

## 8. Backlog-ready specifications

### DEV-00 - Project foundation, auth, roles, shell UI

**Context**

Нужен технический фундамент: репозиторий, локальный запуск, база, Prisma schema, auth, роли, seed `SUPER_ADMIN`, базовые layouts admin/coach и базовый audit service.

**Current state**

Есть документы, но нет кода, репозитория и выбранного стека. Roadmap рекомендует Next.js/React, Node/Next fullstack, PostgreSQL, Prisma, role-based auth и Docker.

**Scope**

- создать структуру проекта;
- настроить PostgreSQL + Prisma;
- реализовать таблицы `schools`, `users`, `admin_profiles`, `coach_profiles`, `audit_logs`;
- реализовать login/password;
- хранить пароли только как hash;
- реализовать `SUPER_ADMIN`, `ADMIN`, `COACH`;
- запретить вход inactive users;
- создать seed `SUPER_ADMIN`;
- создать admin layout и coach layout;
- создать backend guard helpers;
- создать `AuditLogService.log(...)`.

**Implementation details**

Default file targets for recommended stack:

| File | Change |
|---|---|
| `README.md` | запуск, стек, env, seed user |
| `.env.example` | `DATABASE_URL`, session secret |
| `docker-compose.yml` | local PostgreSQL |
| `prisma/schema.prisma` | base enums and tables |
| `src/app/login/*` | login page and submit flow |
| `src/app/admin/*` | admin shell layout |
| `src/app/coach/*` | coach mobile-first shell |
| `src/server/auth/*` | session, password hash, current user |
| `src/server/rbac/*` | role guards and active-user guard |
| `src/server/audit/*` | base audit service |
| `prisma/seed.*` | one school and seed `SUPER_ADMIN` |

API/resource shape:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/users
POST /api/users
PATCH /api/users/:id
```

**Acceptance criteria**

- `AC-AUTH-001` - `AC-AUTH-005`
- `AC-RBAC-007`, `AC-SEC-001`, `AC-SEC-002`, `AC-SEC-004`
- `AC-UI-001`, `AC-UI-002`
- `AC-GLOBAL-001` - `AC-GLOBAL-005`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | password hashing, role guard, active user guard | +6 |
| Integration | login success/failure, inactive user, create user | +5 |
| E2E | SUPER_ADMIN login, ADMIN layout, COACH layout | +3 |

**Rollback plan**

Before real data: revert migrations and reset local DB. After pilot data exists: migration rollback must preserve users or export them before reset.

**Effort**

2-3 development days for first implementation with tests.

**Out of scope**

Parent login, registration, password reset via email/SMS, social login, online payment.

---

### DEV-01 - Core directories: branches, coaches, parents, children, groups

**Context**

Админу нужна база школы: филиалы, тренеры, группы, родители и дети. Без этого расписание и занятия не имеют предметной основы.

**Current state**

Docs define one-school v1, `Branch`, `CoachProfile`, `Parent`, `Child`, `Group`, one active group per child, group capacity warning over 15.

**Scope**

- CRUD for branches;
- CRUD for coach profiles/users through SUPER_ADMIN and allowed admin flows;
- CRUD for parents as contacts, not system users;
- CRUD for children;
- child card with medical notes, admin comment, coach comment;
- child status: `ACTIVE`, `PAUSED`, `LEFT`, `TRIAL`, `ARCHIVED`;
- group creation with branch and main coach;
- attach child to group;
- transfer child between groups with audit log;
- show group occupancy;
- create or prepare `GROUP_OVER_CAPACITY` task when active children count exceeds 15.

**Implementation details**

Data model:

```text
branches
parents
children
groups
users
coach_profiles
tasks
audit_logs
```

Core rules:

- implement `children.current_group_id`;
- enforce one active group per child at service and DB level where possible;
- parents are contacts, not auth users;
- archive/soft-delete entities instead of hard delete;
- audit child transfer and admin-comment edits.

API/resource shape:

```text
/api/branches
/api/coaches
/api/parents
/api/children
/api/groups
/api/groups/:id/children
```

**Acceptance criteria**

- `AC-BRANCH-001` - `AC-BRANCH-002`
- `AC-COACH-001` - `AC-COACH-002`
- `AC-GROUP-001` - `AC-GROUP-004`
- `AC-CHILD-001` - `AC-CHILD-007`
- `AC-UI-004`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | child one-group invariant, occupancy count, archive rules | +7 |
| Integration | CRUD and transfer flows across branches/groups/children | +10 |
| E2E | admin creates branch -> coach -> group -> parent -> child | +2 |

**Rollback plan**

Before pilot: delete created test data. After pilot: use archive status; do not physically delete children, groups, branches or users.

**Effort**

3-5 development days.

**Out of scope**

Group membership history table, parent account, parent cabinet, inventory accounting beyond simple notes.

---

### DEV-02 - Schedule engine

**Context**

Расписание превращает группы в конкретные занятия. Без занятий тренер не может отмечать посещаемость.

**Current state**

Docs define schedule templates, monthly generation, manual lessons, move/cancel with required reason, substitute coach, Russian holidays and mass events.

**Scope**

- `schedule_templates`;
- `lessons`;
- monthly lesson generation from group templates;
- duplicate protection by `(group_id, lesson_date, start_time)`;
- manual lesson creation;
- move lesson with required reason/comment;
- cancel lesson with required reason/comment;
- assign substitute coach;
- admin schedule list and basic calendar/list view;
- coach "today/future/past lessons" view scoped to own and substitute lessons;
- audit move/cancel/substitution.

**Implementation details**

Data model:

```text
schedule_templates
lessons
audit_logs
tasks
```

Required enum:

```text
LessonStatus: SCHEDULED, ATTENDANCE_PENDING, ATTENDANCE_COMPLETED, MOVED, CANCELLED
LessonChangeReason: QUARANTINE, KINDERGARTEN_EVENT, RUSSIAN_HOLIDAY, COACH_UNAVAILABLE, GROUP_TRANSFER, OTHER
```

API/resource shape:

```text
/api/schedule-templates
/api/lessons
/api/lessons/generate-month
/api/lessons/:id/move
/api/lessons/:id/cancel
/api/lessons/:id/substitute
/api/coach/lessons
```

**Acceptance criteria**

- `AC-SCHEDULE-001` - `AC-SCHEDULE-002`
- `AC-LESSON-001` - `AC-LESSON-008`
- `AC-RBAC-001`, `AC-RBAC-004`
- `AC-AUDIT-003`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | generation dates, duplicate prevention, required reason validation | +8 |
| Integration | create/move/cancel/substitute lesson flows | +7 |
| E2E | admin generates month, coach sees own lessons only | +2 |

**Rollback plan**

Lesson generation must be idempotent. Wrong future generated lessons can be archived/cancelled by batch before attendance exists. Once attendance exists, use audit-backed cancellation instead of deletion.

**Effort**

3-5 development days.

**Out of scope**

Drag-and-drop calendar, complex holiday automation, parent-facing schedule.

---

### DEV-03 - Coach attendance workflow

**Context**

Это первый daily-value milestone: тренер открывает занятие на телефоне, видит детей и отмечает табель.

**Current state**

Docs define coach statuses `NOT_MARKED`, `PRESENT`, `ABSENT_UNEXCUSED`, `ABSENT_SICK_PENDING`; incomplete sheet at 18:00 creates tasks and does not deduct balance.

**Scope**

- coach lesson screen, mobile-first;
- list children in lesson group;
- show child name, age, medical limitations, admin comment, coach comment, parent phone/VK, admission status;
- hide all financial details;
- attendance record per child per lesson;
- enforce unique `(lesson_id, child_id)`;
- mark `PRESENT`, `ABSENT_UNEXCUSED`, `ABSENT_SICK_PENDING`;
- require all children marked before `ATTENDANCE_COMPLETED`;
- save attendance and audit changes;
- create `CERTIFICATE_PENDING` on sick pending;
- scheduler/job at 18:00 creates `ATTENDANCE_NOT_FILLED` for coach and admin;
- incomplete attendance does not deduct balances.

**Implementation details**

Data model:

```text
attendance_records
lessons
tasks
audit_logs
```

Task types:

```text
ATTENDANCE_NOT_FILLED
CERTIFICATE_PENDING
ABSENCE_NEEDS_FINALIZATION
```

API/resource shape:

```text
GET  /api/coach/lessons/:id
POST /api/coach/lessons/:id/attendance
PATCH /api/coach/attendance/:recordId
POST /api/jobs/attendance-not-filled-check
```

**Acceptance criteria**

- `AC-COACH-LESSON-001` - `AC-COACH-LESSON-003`
- `AC-ATT-001` - `AC-ATT-008`
- `AC-RBAC-002`, `AC-RBAC-003`, `AC-SEC-003`
- `AC-TASK-004`, `AC-AUDIT-001`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | status transitions, full-sheet validation, financial field redaction | +8 |
| Integration | attendance save, audit write, task creation at 18:00 | +8 |
| E2E | coach fills attendance on mobile viewport | +2 |

**Rollback plan**

Attendance edits must be audit-backed. To undo wrong attendance, create correction records or update attendance through admin/coach edit flow with audit, not DB deletion.

**Effort**

3-5 development days.

**Out of scope**

Offline mode, automatic deduction for unmarked children, final admin absence statuses except where needed to create pending tasks.

---

### DEV-04 - Subscriptions, balances, debt and admission

**Context**

После табеля система должна корректно списывать занятия, учитывать долг и показывать тренеру только допуск.

**Current state**

Docs define monthly subscription, default lesson price 450 RUB, payment statuses, balance transactions, debt to -1, `ADMITTED`, `CREDIT_LESSON_USED`, `NOT_ADMITTED`.

**Scope**

- `subscriptions`;
- `lesson_balance_transactions`;
- cached lesson balance and makeup balance on child;
- create subscription with N lessons and amount;
- default price 450 RUB per lesson, stored in kopeks;
- mid-month subscription amount by remaining lessons;
- payment status with required comment on change;
- payment status changed date;
- `PRESENT` deducts 1 lesson;
- `ABSENT_UNEXCUSED` deducts 1 lesson;
- `ABSENT_SICK_PENDING` does not deduct;
- balance 0 + present allows one credit lesson, balance becomes -1 and admission becomes `CREDIT_LESSON_USED`;
- if unpaid before next lesson, admission becomes `NOT_ADMITTED`;
- coach API returns only `admission_status`;
- admin sees payment, balances, transactions and debt.

**Implementation details**

Data model:

```text
subscriptions
lesson_balance_transactions
children.cached_lesson_balance
children.cached_makeup_balance
children.admission_status
audit_logs
tasks
```

Transaction types:

```text
SUBSCRIPTION_CREATED
PRESENT_DEDUCTION
UNEXCUSED_ABSENCE_DEDUCTION
CREDIT_LESSON_USED
MANUAL_ADJUSTMENT
```

API/resource shape:

```text
/api/subscriptions
/api/children/:id/balance
/api/children/:id/payment-status
/api/children/:id/manual-balance-adjustment
/api/jobs/admission-status-check
```

**Acceptance criteria**

- `AC-SUB-001` - `AC-SUB-006`
- `AC-BAL-001` - `AC-BAL-002`
- `AC-CREDIT-001` - `AC-CREDIT-005`
- `AC-RBAC-002`, `AC-RBAC-003`, `AC-SEC-003`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | balance transaction math, payment comment validation, admission transitions | +10 |
| Integration | subscription create, attendance deduction, credit lesson, not admitted check | +10 |
| E2E | admin creates subscription, coach sees admission only | +2 |

**Rollback plan**

Never patch cached balances directly in production. Undo via compensating `lesson_balance_transactions` with required comment and audit log.

**Effort**

4-6 development days.

**Out of scope**

Payment provider, online payment, invoices, accounting, coach-visible ruble debt.

---

### DEV-05 - Absences, sickness, vacation, group events and makeups

**Context**

Уважительные причины отсутствия не должны терять занятия. Они создают переносы и уменьшают будущую оплату.

**Current state**

Docs define sickness pending, sickness confirmed, vacation approved, group quarantine, kindergarten events, `MakeupCredit`, makeup board and no file storage for certificates/vacation statements.

**Scope**

- admin final attendance statuses;
- sickness confirmation flow;
- certificate pending and 7-day sickness follow-up;
- vacation approval, no backdating;
- group events: quarantine, kindergarten event, Russian holiday, coach unavailable, group transfer, other;
- create `MakeupCredit` on confirmed sickness/vacation/quarantine/event;
- create makeup balance transaction;
- makeup board;
- assign makeup date/lesson;
- prevent makeup use in another group;
- mark makeup used/refunded/cancelled;
- auto-close related tasks where applicable;
- audit all finalization, makeup creation, assignment and usage.

**Implementation details**

Data model:

```text
makeup_credits
group_events
attendance_records.final_status
lesson_balance_transactions
tasks
audit_logs
```

Makeup statuses:

```text
AVAILABLE
ASSIGNED
USED
REFUNDED
CANCELLED
```

API/resource shape:

```text
/api/attendance/:id/finalize
/api/children/:id/vacations
/api/group-events
/api/makeups
/api/makeups/:id/assign
/api/makeups/:id/use
```

**Acceptance criteria**

- `AC-SICK-001` - `AC-SICK-004`
- `AC-VAC-001` - `AC-VAC-005`
- `AC-GEVENT-001` - `AC-GEVENT-004`
- `AC-MAKEUP-001` - `AC-MAKEUP-006`
- `AC-NONGOAL-004`, `AC-NONGOAL-005`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | final status effects, vacation backdate guard, group-only makeup guard | +9 |
| Integration | sickness -> makeup, vacation -> makeup, group event -> makeups | +9 |
| E2E | admin finalizes sickness and assigns makeup | +2 |

**Rollback plan**

Use makeup status transitions and compensating balance transactions. Do not delete historical absence or makeup records after they affect balance.

**Effort**

4-6 development days.

**Out of scope**

Uploading medical certificate files, uploading vacation statement files, cross-group makeup usage, expiry dates for makeups.

---

### DEV-06 - Internal tasks and operational center

**Context**

В v1 уведомления - это не Telegram/VK/SMS/email, а внутренние задачи. Операционный центр должен показывать админу, что требует действия сегодня.

**Current state**

Docs define `Task`, task types, priorities, triggers, dedupe rules, auto-close rules, admin/coach visibility and task texts.

**Scope**

- `Task` model and service;
- task creation with type, priority, status, assignee, related entity, title, description, due date;
- `createTaskIfNotExists(...)`;
- `closeTasksByCondition(...)`;
- `getTasksForUser(...)`;
- `getOperationalTasksForAdmin(...)`;
- task dedupe by open task type and related entity;
- task center for admin and coach;
- operational center widgets;
- automatic task triggers for attendance, sickness, makeups, group capacity, trial processing, credit lesson, not admitted, no active subscription;
- close task manually with comment where needed.

**Implementation details**

Task types:

```text
ATTENDANCE_NOT_FILLED
CHILD_TOOK_CREDIT_LESSON
CHILD_NOT_ADMITTED
SICKNESS_FOLLOW_UP
CERTIFICATE_PENDING
MAKEUP_NEEDS_ASSIGNMENT
GROUP_OVER_CAPACITY
TRIAL_NEEDS_PROCESSING
ABSENCE_NEEDS_FINALIZATION
COACH_SUBSTITUTION_ASSIGNED
CHILD_WITHOUT_ACTIVE_SUBSCRIPTION
MANUAL_TASK
```

Operational center widgets:

```text
Today's lessons
Unfilled attendance
Children without active subscription
Children with debt
Children with NOT_ADMITTED
Pending certificates
Available makeups
Groups over 15 children
Trials to process
Critical tasks
```

API/resource shape:

```text
/api/tasks
/api/tasks/:id/close
/api/admin/operational-center
/api/coach/tasks
/api/jobs/task-checks/*
```

**Acceptance criteria**

- `AC-TASK-001` - `AC-TASK-008`
- `AC-OPS-001` - `AC-OPS-006`
- `AC-GLOBAL-005`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | dedupe, priority selection, auto-close conditions | +10 |
| Integration | all automatic task triggers and role-scoped list access | +12 |
| E2E | admin operational center, coach own task list | +3 |

**Rollback plan**

Tasks can be cancelled with reason if generated incorrectly. Preserve audit for closed/cancelled critical tasks.

**Effort**

4-6 development days.

**Out of scope**

External notification engine, read/unread state unless cheap, user-custom notification templates, parent notifications.

---

### DEV-07 - Trial lessons

**Context**

Пробник не является обычным ребёнком, но должен быть виден тренеру внутри занятия и попадать админу в обработку после пробного.

**Current state**

Docs define `TrialParticipant`, optional fields, free first trial, coach-created trials, admin conversion to child and `TRIAL_NEEDS_PROCESSING` task.

**Scope**

- `trial_participants`;
- admin creates trial for lesson/group/coach/date;
- coach can add trial inside own lesson;
- trial fields optional;
- trial displayed in separate lesson block;
- coach marks attended/no-show/contact collected;
- coach can edit contact info;
- after trial completion create `TRIAL_NEEDS_PROCESSING`;
- admin processes trial;
- admin converts trial to `Child`;
- coach cannot convert trial.

**Implementation details**

Required statuses:

```text
TRIAL_BOOKED
TRIAL_ATTENDED
TRIAL_NO_SHOW
CONTACT_COLLECTED
TRANSFERRED_TO_ADMIN
CONVERTED_TO_ACTIVE
```

API/resource shape:

```text
/api/trials
/api/coach/lessons/:lessonId/trials
/api/trials/:id/status
/api/trials/:id/convert
```

**Acceptance criteria**

- `AC-TRIAL-001` - `AC-TRIAL-007`
- `AC-TASK-006`
- `AC-RBAC-006`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | status transitions, optional field validation, coach permission guard | +6 |
| Integration | coach creates/marks trial, admin converts, task created | +7 |
| E2E | trial appears in coach lesson and admin task center | +2 |

**Rollback plan**

If converted incorrectly, admin must archive the created child with audit and reopen/correct trial state through admin-only flow.

**Effort**

2-4 development days.

**Out of scope**

CRM lead pipeline, marketing automation, paid trial logic.

---

### DEV-08 - Excel import

**Context**

Excel import is for initial population only. It must not become a daily sync or dirty-data auto-merge.

**Current state**

Docs define one `.xlsx`, fixed sheet names, stable technical column names, validation, preview, create-only confirmed import, import batches and import errors.

**Scope**

- upload `.xlsx`, SUPER_ADMIN only;
- parse sheets by fixed names;
- validate required sheets and columns;
- validate types, enum values, dates, times, duplicate codes and cross-sheet references;
- ignore empty rows;
- warn on unknown extra columns;
- preview counts and errors before DB write;
- block import on critical errors;
- confirmed import creates branches, coaches/users, groups, parents, children, schedule templates and optionally lessons;
- do not import historical attendance, current balances, current makeups or payment history;
- write `import_batches`, `import_errors`, audit log;
- do not store uploaded file permanently unless implementation needs temporary processing.

**Implementation details**

Minimum sheets:

```text
Branches
Coaches
Groups
Parents
Children
Schedule
```

Extended sheets:

```text
Lessons
AttendanceSource
```

Important mapping:

```text
branch_code -> branch_id
coach_code -> coach_profile_id
group_code -> group_id
parent_code -> parent_id
child_code -> child_id
```

API/resource shape:

```text
POST /api/import/excel/validate
POST /api/import/excel/confirm
GET  /api/import/batches/:id
GET  /api/import/batches/:id/errors
```

**Acceptance criteria**

- `AC-IMPORT-001` - `AC-IMPORT-009`
- `AC-SEC-005`
- Excel spec AC `32.1` - `32.10`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | sheet validators, code mappings, date/time/enum parsing | +14 |
| Integration | validation-only, critical errors, confirmed import transaction | +8 |
| E2E | SUPER_ADMIN uploads file, previews, confirms | +2 |

**Rollback plan**

Confirmed import should run in one transaction or safe batch with batch id. If rollback is needed before pilot, delete/rollback all records by import batch. After pilot, prefer archive/correction over deletion.

**Effort**

4-7 development days.

**Out of scope**

Google Sheets sync, auto upsert, custom column mapping, financial history import, attendance history import, current balances import, file storage of source docs.

---

### DEV-09 - RBAC, API visibility and audit hardening

**Context**

Security failures in this product are business failures: financial fields leaking to coach, coach changing schedule/payment, or audit gaps on critical actions.

**Current state**

Docs define detailed permission matrix, coach visibility rules, backend guards, audit requirements and security acceptance criteria.

**Scope**

- review every route/action for role guard;
- enforce active user guard;
- enforce coach lesson scope:

```text
lesson.coach_id = current_coach.id
OR lesson.substitute_coach_id = current_coach.id
```

- enforce coach child scope via group/lesson;
- ensure coach API never returns financial fields;
- hide forbidden UI actions for coach;
- block schedule/payment/balance/makeup/admin actions for coach in backend;
- require comments for payment status, manual balance adjustment, lesson move/cancel, mass event, archive/left;
- ensure audit log coverage for all critical actions;
- make audit log read-only and admin/super-admin only.

**Implementation details**

Financial fields forbidden for coach:

```text
payment_status
lesson_price_kopeks
total_amount_kopeks
payment_status_comment
lesson_balance_transactions
cached_lesson_balance
cached_makeup_balance
financial_comments
invoice_data
payment_history
```

Audit events must cover:

```text
attendance change
payment status change
subscription create/update
balance transaction/manual adjustment
makeup create/assign/use/refund/cancel
lesson move/cancel/substitute
child status/group/comment/medical changes
critical task close
excel import
```

**Acceptance criteria**

- `AC-RBAC-001` - `AC-RBAC-008`
- `AC-AUDIT-001` - `AC-AUDIT-005`
- `AC-SEC-001` - `AC-SEC-005`
- `AC-UI-004`, `AC-UI-005`

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Unit | permission matrix, API redaction serializers, audit required-comment validation | +12 |
| Integration | forbidden direct API calls by coach across modules | +20 |
| E2E | coach cannot see finances or forbidden controls | +4 |

**Rollback plan**

If hardening breaks legitimate admin work, revert only the affected guard change. Never relax coach financial redaction globally.

**Effort**

3-5 development days after DEV-00 through DEV-08 exist.

**Out of scope**

Parent data-sharing permissions, SaaS tenant isolation beyond `school_id`, external audit export.

---

### DEV-10 - Pilot launch, release gates and stabilization

**Context**

v1 should not launch across the whole school first. Pilot catches operational bugs before they affect all groups.

**Current state**

Roadmap recommends pilot on 1-2 branches, 2-4 groups, 1-2 coaches, 1 admin for 1-2 weeks.

**Scope**

- internal demo gate;
- attendance pilot gate;
- balance pilot gate;
- operational pilot gate;
- full rollout gate;
- seed/import or manually enter pilot data;
- training checklist for admin and coach;
- daily manual reconciliation checklist;
- bug/UX issue intake;
- readiness dashboard for MVP metrics;
- stabilization pass after pilot.

**Implementation details**

Pilot size:

```text
1-2 branches
2-4 groups
1-2 coaches
1 admin
1-2 weeks
```

Gate sequence:

```text
Gate 1 - internal demo
Gate 2 - attendance pilot
Gate 3 - balance pilot
Gate 4 - operational pilot
Gate 5 - full internal rollout
```

Pilot must verify:

- coach can conduct lessons without developer help;
- admin sees attendance results;
- balance changes are correct;
- sickness does not deduct before confirmation;
- makeups are created and not lost;
- debt and `NOT_ADMITTED` work;
- internal tasks do not duplicate or disappear;
- coach works from phone;
- audit/correction flow is usable.

**Acceptance criteria**

- all critical AC from Auth, RBAC, Children, Groups, Schedule, Attendance, Subscriptions, Makeups, Tasks and Audit Log;
- `MVP Release Readiness Checklist` in `10_ACCEPTANCE_CRITERIA_RU.md`;
- Roadmap gates 1-5.

**Testing plan**

| Layer | What | Count |
|---|---|---:|
| Manual QA | full operational cycle on pilot data | +1 checklist |
| E2E | happy path plus blocked path for coach, admin, super-admin | +8 |
| Regression | all critical AC groups before full rollout | +1 suite |

**Rollback plan**

Keep Excel/manual process as fallback through pilot. If critical bug appears, pause new data entry in My School, export relevant records, correct data through audit-backed admin flows, and resume after fix.

**Effort**

1-2 weeks calendar time for pilot plus stabilization, depending on bug volume.

**Out of scope**

Full school launch before Gate 5, external parent communication automation, SaaS discovery.

---

## 9. Release gates

| Gate | Ready when |
|---|---|
| Gate 1 - Internal demo | login, roles, branches, groups, children, schedule, lessons, coach can open lesson |
| Gate 2 - Attendance pilot | coach sees lessons/children, saves attendance, admin sees result, 18:00 task exists |
| Gate 3 - Balance pilot | subscriptions, balance accrual, present/unexcused deductions, sick pending no deduction, audit |
| Gate 4 - Operational pilot | sickness, makeups, debt, not admitted, tasks, ops center, trials |
| Gate 5 - Full rollout | pilot passed, critical bugs fixed, admin trusts data, coach mobile flow works, RBAC checked |

---

## 10. Test strategy by risk

| Risk | Required test focus |
|---|---|
| Wrong balance | Unit + integration tests for every transaction type |
| Coach sees finances | Serializer tests + direct API tests + E2E UI checks |
| Duplicate lessons | DB unique constraint + generation idempotency tests |
| Duplicate tasks | TaskService dedupe tests |
| Lost makeups | Integration tests for sickness/vacation/group events |
| Unfilled attendance deducts | Scheduler tests proving task created and no transaction created |
| Excel damages data | validation-only, preview, transaction rollback tests |
| Audit gaps | integration tests for every critical action |

Minimum automated suite before pilot:

```text
Unit: 80+
Integration: 80+
E2E: 20+
Manual pilot checklist: 1 full operational cycle
```

---

## 11. Open decisions before coding

These are not product blockers, but they should be decided when creating the repo.

| Decision | Default in this spec | Why |
|---|---|---|
| Exact stack | Next.js fullstack + Prisma + PostgreSQL | matches roadmap recommendation |
| Hosting | not selected | depends on available accounts and budget |
| Backups | daily managed DB backup at minimum | attendance/balance data must not be lost |
| Russian holidays | start with configurable holiday dates table/list | avoids external integration in v1 |
| Partial attendance save | not completed until all children marked | safest v1 behavior |
| Generated lesson batch id | optional | useful for rollback, not required by docs |
| Task `IN_PROGRESS` | optional | docs allow minimal `OPEN`/`CLOSED` |
| Group membership history | out of v1 | docs say one current group is enough |

---

## 12. First implementation prompt

Use this prompt to start development from a clean repository:

```text
Ты работаешь над My School для Азбуки движения.

Изучи документы:
00_PROJECT_BRIEF_RU.md
01_PRD_V1_RU.md
02_BUSINESS_RULES_RU.md
03_DOMAIN_MODEL_RU.md
04_ROLES_AND_PERMISSIONS_RU.md
05_USER_FLOWS_RU.md
06_DATA_MODEL_RU.md
07_UI_SPEC_RU.md
08_TASKS_AND_NOTIFICATIONS_RU.md
09_EXCEL_IMPORT_SPEC_RU.md
10_ACCEPTANCE_CRITERIA_RU.md
11_ROADMAP_RU.md
12_DEVELOPMENT_SPECS_RU.md

Начни с DEV-00:
- создай Next.js/React fullstack проект;
- настрой PostgreSQL, Prisma, Docker local dev;
- реализуй School, User, AdminProfile, CoachProfile, AuditLog;
- реализуй роли SUPER_ADMIN, ADMIN, COACH;
- реализуй login/password auth;
- создай seed SUPER_ADMIN;
- добавь admin layout и mobile-first coach layout;
- добавь базовые backend guards;
- не реализуй parent login, online payment, chat, external notifications, certificate/vacation file storage или SaaS UI.

После реализации дай список созданных файлов, миграций, seed credentials, команды запуска и тесты.
```

---

## 13. Definition of Done для v1

v1 готова к первому внутреннему использованию только если:

1. Полный operational cycle проходит от филиала до задачи админу.
2. 95%+ занятий можно закрывать посещаемостью в день проведения.
3. Тренер может провести день занятий с телефона без помощи разработчика.
4. Админ видит все критичные проблемы в операционном центре.
5. Система не теряет переносы.
6. `NOT_ADMITTED` блокирует тренера и не обходится API.
7. `COACH` не видит финансовые поля в UI/API.
8. Незаполненный табель не списывает занятия.
9. Все критичные действия пишутся в audit log.
10. Excel import либо работает через validation/preview/confirm, либо стартовые данные внесены вручную.
11. Non-goals v1 отсутствуют в продукте.

---

## 14. Итог

Разрабатывать My School нужно не как набор CRUD-экранов, а как операционную систему вокруг ребёнка, занятия, баланса, переноса, допуска и задач.

Самая важная последовательность:

```text
Foundation -> Directories -> Schedule -> Attendance -> Balance -> Makeups -> Tasks -> Trials -> Import -> Hardening -> Pilot
```

Самый важный результат v1:

```text
Азбука движения ежедневно управляет расписанием, посещаемостью, списаниями, переносами, долгами и допуском без хаоса в Excel и чатах.
```
