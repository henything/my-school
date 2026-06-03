# 06_DATA_MODEL.md

# My School — Data Model

**Проект:** My School  
**Бизнес:** Азбука движения  
**Тип документа:** Data Model / Модель данных  
**Версия:** v1.0  
**Дата:** 2026-06-02  
**Язык:** русский  
**Назначение:** описать структуру данных v1 для проектирования базы данных, ORM-схемы, API и задач Codex  

---

## 1. Назначение документа

Этот документ описывает модель данных первой версии продукта **My School** для школы **Азбука движения**.

Документ является техническим продолжением:

```text
00_PROJECT_BRIEF.md
01_PRD_V1.md
02_BUSINESS_RULES.md
03_DOMAIN_MODEL.md
04_ROLES_AND_PERMISSIONS.md
05_USER_FLOWS.md
```

Цель документа — зафиксировать:

- таблицы/модели;
- поля;
- типы данных;
- enum-статусы;
- связи;
- ограничения;
- индексы;
- правила хранения балансов;
- правила soft delete / архивирования;
- audit log;
- технические инварианты.

Документ написан в стиле, близком к PostgreSQL/Prisma, но не является финальной миграцией. Его можно использовать как основу для Prisma schema, SQL migrations или backend entity models.

---

## 2. Общие принципы модели данных

## 2.1 PostgreSQL-oriented подход

Рекомендуемая база данных для v1:

```text
PostgreSQL
```

Рекомендуемый ORM:

```text
Prisma
```

Но сама модель может быть адаптирована под другой стек.

---

## 2.2 Денежные значения хранить в копейках

Все суммы хранить целыми числами в копейках.

Пример:

```text
450 рублей = 45000 копеек
3600 рублей = 360000 копеек
```

Не использовать float/decimal для денег, если можно избежать.

---

## 2.3 Балансы хранить через транзакции

Баланс занятий и переносов нельзя хранить только как изменяемое число.

Источник истины:

```text
lesson_balance_transactions
```

При этом для удобства и скорости можно хранить кешированные поля в `children` или считать баланс запросом.

Рекомендуемый подход:

```text
lesson_balance = SUM(transactions.amount WHERE balance_type = LESSON_BALANCE)
makeup_balance = SUM(transactions.amount WHERE balance_type = MAKEUP_BALANCE)
```

Если используются cached fields, они должны обновляться только через транзакционную операцию.

---

## 2.4 Разделять статусы занятия и посещаемости

Не смешивать:

```text
lessons.status
attendance_records.status
attendance_records.final_status
```

Занятие может быть завершено, но у разных детей внутри занятия разные статусы.

---

## 2.5 Разделять оплату и допуск

Не смешивать:

```text
payment_status
admission_status
```

`payment_status` — финансово-операционный статус абонемента.

`admission_status` — простой статус для тренера:

```text
ADMITTED
CREDIT_LESSON_USED
NOT_ADMITTED
```

Тренер видит только `admission_status`.

---

## 2.6 Soft delete вместо физического удаления

Для ключевых сущностей использовать статусы или `archived_at`.

Физически не удалять:

- детей;
- родителей;
- группы;
- филиалы;
- пользователей;
- занятия;
- посещаемость;
- абонементы;
- транзакции баланса;
- переносы;
- audit log.

---

## 2.7 Audit log обязателен

Все критичные изменения должны записываться в `audit_logs`.

---

## 2.8 School-aware структура

В v1 школа одна — **Азбука движения**.

Но для будущей SaaS-готовности ключевые таблицы должны иметь:

```text
school_id
```

В UI v1 выбор школы не нужен.

---

## 3. Список таблиц v1

Основные таблицы:

```text
schools
users
admin_profiles
coach_profiles
branches
parents
children
groups
schedule_templates
lessons
attendance_records
subscriptions
lesson_balance_transactions
makeup_credits
trial_participants
group_events
tasks
audit_logs
import_batches
import_errors
```

Опциональные/будущие таблицы, не обязательные в первом milestone:

```text
lesson_changes
notification_logs
```

---

# 4. Enums

## 4.1 UserRole

```text
SUPER_ADMIN
ADMIN
COACH
```

---

## 4.2 UserStatus

```text
ACTIVE
INACTIVE
ARCHIVED
```

---

## 4.3 EntityStatus

Общий статус для филиалов, групп и подобных сущностей.

```text
ACTIVE
INACTIVE
ARCHIVED
```

---

## 4.4 ChildStatus

```text
ACTIVE
PAUSED
LEFT
TRIAL
ARCHIVED
```

---

## 4.5 LessonStatus

```text
SCHEDULED
ATTENDANCE_PENDING
ATTENDANCE_COMPLETED
MOVED
CANCELLED
```

---

## 4.6 CoachAttendanceStatus

Статусы, которые может поставить тренер.

```text
NOT_MARKED
PRESENT
ABSENT_UNEXCUSED
ABSENT_SICK_PENDING
```

---

## 4.7 AdminFinalAttendanceStatus

Финальные статусы отсутствия, которые ставит админ.

```text
ABSENT_SICK_CONFIRMED
ABSENT_VACATION_APPROVED
ABSENT_QUARANTINE
ABSENT_EVENT
ABSENT_UNEXCUSED_FINAL
```

---

## 4.8 PaymentStatus

```text
NOT_INVOICED
INVOICED
NOT_PAID
PAID
PARTIALLY_PAID
OVERDUE
```

---

## 4.9 AdmissionStatus

```text
ADMITTED
CREDIT_LESSON_USED
NOT_ADMITTED
```

---

## 4.10 LessonChangeReason

Причины переноса/отмены занятия.

```text
QUARANTINE
KINDERGARTEN_EVENT
RUSSIAN_HOLIDAY
COACH_UNAVAILABLE
GROUP_TRANSFER
OTHER
```

---

## 4.11 AbsenceReason

Причины отсутствия ребёнка.

```text
SICKNESS
VACATION
UNEXCUSED
QUARANTINE
KINDERGARTEN_EVENT
OTHER
```

---

## 4.12 BalanceTransactionType

```text
SUBSCRIPTION_CREATED
PRESENT_DEDUCTION
UNEXCUSED_ABSENCE_DEDUCTION
SICKNESS_MAKEUP_CREATED
VACATION_MAKEUP_CREATED
QUARANTINE_MAKEUP_CREATED
EVENT_MAKEUP_CREATED
CREDIT_LESSON_USED
MAKEUP_USED
MANUAL_ADJUSTMENT
```

---

## 4.13 BalanceType

```text
LESSON_BALANCE
MAKEUP_BALANCE
```

---

## 4.14 MakeupStatus

```text
AVAILABLE
ASSIGNED
USED
REFUNDED
CANCELLED
```

---

## 4.15 MakeupReason

```text
SICKNESS
VACATION
QUARANTINE
KINDERGARTEN_EVENT
OTHER
```

---

## 4.16 TrialStatus

```text
TRIAL_BOOKED
TRIAL_ATTENDED
TRIAL_NO_SHOW
CONTACT_COLLECTED
TRANSFERRED_TO_ADMIN
CONVERTED_TO_ACTIVE
```

---

## 4.17 TrialSource

```text
VK
REFERRAL
KINDERGARTEN
ADVERTISING
OTHER
UNKNOWN
```

---

## 4.18 GroupEventReason

```text
QUARANTINE
KINDERGARTEN_EVENT
RUSSIAN_HOLIDAY
COACH_UNAVAILABLE
GROUP_TRANSFER
OTHER
```

---

## 4.19 GroupEventActionType

```text
MOVE_LESSONS
CANCEL_LESSONS
```

---

## 4.20 TaskPriority

```text
CRITICAL
HIGH
MEDIUM
LOW
```

---

## 4.21 TaskStatus

```text
OPEN
IN_PROGRESS
CLOSED
CANCELLED
```

---

## 4.22 TaskType

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

---

## 4.23 ImportStatus

```text
UPLOADED
VALIDATING
VALIDATION_FAILED
READY_TO_IMPORT
IMPORTED
FAILED
```

---

# 5. Таблица schools

## 5.1 Назначение

Хранит школу/организацию.

В v1 одна запись:

```text
Азбука движения
```

## 5.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| name | String | Да | Название школы |
| status | EntityStatus | Да | Статус |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 5.3 Связи

```text
schools 1 → N users
schools 1 → N branches
schools 1 → N groups
schools 1 → N children
```

## 5.4 Индексы

```text
idx_schools_status(status)
```

---

# 6. Таблица users

## 6.1 Назначение

Хранит аккаунты пользователей системы.

## 6.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| full_name | String | Да | ФИО пользователя |
| login | String | Да | Логин |
| password_hash | String | Да | Хеш пароля |
| role | UserRole | Да | Роль |
| status | UserStatus | Да | Статус пользователя |
| last_login_at | DateTime? | Нет | Последний вход |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 6.3 Ограничения

```text
UNIQUE(login)
```

## 6.4 Связи

```text
users N → 1 schools
users 1 → 0/1 admin_profiles
users 1 → 0/1 coach_profiles
users 1 → N tasks as assignee
users 1 → N audit_logs as actor
```

## 6.5 Индексы

```text
idx_users_school_id(school_id)
idx_users_role(role)
idx_users_status(status)
idx_users_login(login)
```

## 6.6 Правила

- пользователей создаёт SUPER_ADMIN вручную;
- родительских аккаунтов в v1 нет;
- COACH не должен видеть финансовые данные;
- неактивный пользователь не может войти.

---

# 7. Таблица admin_profiles

## 7.1 Назначение

Дополнительный профиль администратора.

## 7.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| user_id | UUID | Да | FK → users.id |
| phone | String? | Нет | Телефон |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 7.3 Ограничения

```text
UNIQUE(user_id)
```

## 7.4 Связи

```text
admin_profiles 1 → 1 users
```

---

# 8. Таблица coach_profiles

## 8.1 Назначение

Профиль тренера.

## 8.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| user_id | UUID | Да | FK → users.id |
| phone | String? | Нет | Телефон |
| comment | Text? | Нет | Комментарий |
| status | EntityStatus | Да | Статус профиля |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 8.3 Ограничения

```text
UNIQUE(user_id)
```

## 8.4 Связи

```text
coach_profiles 1 → 1 users
coach_profiles 1 → N groups as main_coach
coach_profiles 1 → N lessons as coach
coach_profiles 1 → N lessons as substitute_coach
```

## 8.5 Индексы

```text
idx_coach_profiles_user_id(user_id)
idx_coach_profiles_status(status)
```

---

# 9. Таблица branches

## 9.1 Назначение

Филиал/локация, где проходят занятия.

## 9.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| name | String | Да | Название филиала |
| address | String? | Нет | Адрес |
| status | EntityStatus | Да | ACTIVE / INACTIVE / ARCHIVED |
| inventory_notes | Text? | Нет | Заметки по инвентарю |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 9.3 Связи

```text
branches N → 1 schools
branches 1 → N groups
branches 1 → N lessons
```

## 9.4 Индексы

```text
idx_branches_school_id(school_id)
idx_branches_status(status)
```

## 9.5 Правила

- филиалы создаются вручную;
- филиал не удаляется физически при наличии истории;
- на старте ожидается около 10 филиалов.

---

# 10. Таблица parents

## 10.1 Назначение

Родитель или законный представитель ребёнка.

В v1 родитель не имеет аккаунта в системе.

## 10.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| full_name | String? | Нет | ФИО родителя |
| phone | String? | Нет | Телефон |
| vk_profile_url | String? | Нет | Ссылка на VK |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 10.3 Связи

```text
parents N → 1 schools
parents 1 → N children
```

## 10.4 Индексы

```text
idx_parents_school_id(school_id)
idx_parents_phone(phone)
```

## 10.5 Правила

- тренер может видеть телефон и VK родителя;
- родитель не входит в систему;
- чат с родителем остаётся вне системы.

---

# 11. Таблица children

## 11.1 Назначение

Ребёнок, который занимается, был пробником, находится на паузе или ушёл.

## 11.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| parent_id | UUID? | Нет | FK → parents.id |
| current_group_id | UUID? | Нет | FK → groups.id |
| current_subscription_id | UUID? | Нет | FK → subscriptions.id |
| full_name | String | Да | ФИО ребёнка |
| birth_date | Date? | Нет | Дата рождения |
| status | ChildStatus | Да | Статус ребёнка |
| medical_notes | Text? | Нет | Медицинские ограничения |
| coach_comment | Text? | Нет | Комментарий тренера |
| admin_comment | Text? | Нет | Внутренний комментарий админа |
| admission_status | AdmissionStatus | Да | Статус допуска |
| cached_lesson_balance | Int | Да | Кеш баланса занятий |
| cached_makeup_balance | Int | Да | Кеш баланса переносов |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 11.3 Связи

```text
children N → 1 schools
children N → 0/1 parents
children N → 0/1 groups as current_group
children 1 → N attendance_records
children 1 → N subscriptions
children 1 → N lesson_balance_transactions
children 1 → N makeup_credits
children 1 → N tasks
```

## 11.4 Индексы

```text
idx_children_school_id(school_id)
idx_children_parent_id(parent_id)
idx_children_current_group_id(current_group_id)
idx_children_status(status)
idx_children_admission_status(admission_status)
idx_children_full_name(full_name)
```

## 11.5 Ограничения

```text
current_group_id допускает только одну активную группу для ребёнка.
```

Технически это можно реализовать через одно поле `current_group_id`, без таблицы активных membership.

## 11.6 Правила

- ребёнок не может быть в двух группах одновременно;
- баланс должен меняться только через `lesson_balance_transactions`;
- cached-балансы можно обновлять только в одной транзакции с созданием операции;
- тренер не видит финансовые детали, но видит `admission_status`;
- ребёнка не удалять физически при наличии истории.

---

# 12. Таблица groups

## 12.1 Назначение

Группа детей, которая занимается по расписанию.

## 12.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| branch_id | UUID | Да | FK → branches.id |
| main_coach_id | UUID | Да | FK → coach_profiles.id |
| name | String | Да | Название группы |
| status | EntityStatus | Да | ACTIVE / INACTIVE / ARCHIVED |
| capacity_limit | Int | Да | Ориентир вместимости, по умолчанию 15 |
| inventory_notes | Text? | Нет | Заметки по инвентарю |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 12.3 Связи

```text
groups N → 1 schools
groups N → 1 branches
groups N → 1 coach_profiles as main_coach
groups 1 → N children
groups 1 → N schedule_templates
groups 1 → N lessons
groups 1 → N group_events
```

## 12.4 Индексы

```text
idx_groups_school_id(school_id)
idx_groups_branch_id(branch_id)
idx_groups_main_coach_id(main_coach_id)
idx_groups_status(status)
```

## 12.5 Правила

- группа должна иметь филиал;
- группа должна иметь основного тренера;
- если количество активных детей > 15, создать задачу `GROUP_OVER_CAPACITY`;
- заполненность группы должна быть видна админу.

---

# 13. Таблица schedule_templates

## 13.1 Назначение

Шаблон регулярного расписания группы.

## 13.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| group_id | UUID | Да | FK → groups.id |
| branch_id | UUID | Да | FK → branches.id |
| coach_id | UUID | Да | FK → coach_profiles.id |
| weekday | Int | Да | День недели, 1–7 |
| start_time | Time | Да | Время начала |
| end_time | Time | Да | Время окончания |
| valid_from | Date? | Нет | Дата начала действия |
| valid_to | Date? | Нет | Дата окончания действия |
| status | EntityStatus | Да | ACTIVE / INACTIVE / ARCHIVED |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 13.3 Связи

```text
schedule_templates N → 1 groups
schedule_templates N → 1 branches
schedule_templates N → 1 coach_profiles
schedule_templates 1 → N lessons
```

## 13.4 Индексы

```text
idx_schedule_templates_group_id(group_id)
idx_schedule_templates_weekday(weekday)
idx_schedule_templates_status(status)
```

## 13.5 Правила

- группа обычно имеет 2 занятия в неделю;
- занятия генерируются на месяц;
- изменение шаблона не должно автоматически менять уже созданные занятия без явного действия.

---

# 14. Таблица lessons

## 14.1 Назначение

Конкретное занятие в конкретную дату и время.

## 14.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| group_id | UUID | Да | FK → groups.id |
| branch_id | UUID | Да | FK → branches.id |
| schedule_template_id | UUID? | Нет | FK → schedule_templates.id |
| coach_id | UUID | Да | FK → coach_profiles.id |
| substitute_coach_id | UUID? | Нет | FK → coach_profiles.id |
| lesson_date | Date | Да | Дата занятия |
| start_time | Time | Да | Время начала |
| end_time | Time | Да | Время окончания |
| status | LessonStatus | Да | Статус занятия |
| change_reason | LessonChangeReason? | Нет | Причина переноса/отмены |
| change_comment | Text? | Нет | Комментарий |
| moved_from_lesson_id | UUID? | Нет | FK → lessons.id, если нужно связать перенос |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 14.3 Связи

```text
lessons N → 1 schools
lessons N → 1 groups
lessons N → 1 branches
lessons N → 1 coach_profiles as coach
lessons N → 0/1 coach_profiles as substitute_coach
lessons 1 → N attendance_records
lessons 1 → N trial_participants
lessons 1 → N tasks
```

## 14.4 Индексы

```text
idx_lessons_school_id(school_id)
idx_lessons_group_id(group_id)
idx_lessons_branch_id(branch_id)
idx_lessons_coach_id(coach_id)
idx_lessons_substitute_coach_id(substitute_coach_id)
idx_lessons_date(lesson_date)
idx_lessons_status(status)
idx_lessons_group_date(group_id, lesson_date)
idx_lessons_coach_date(coach_id, lesson_date)
```

## 14.5 Ограничения

Рекомендуемое уникальное ограничение для защиты от дублей:

```text
UNIQUE(group_id, lesson_date, start_time)
```

## 14.6 Правила

- lesson может быть создан из шаблона или вручную;
- только ADMIN/SUPER_ADMIN могут переносить/отменять занятие;
- отменённое занятие не списывает абонемент;
- тренер видит занятие, если он `coach_id` или `substitute_coach_id`.

---

# 15. Таблица attendance_records

## 15.1 Назначение

Отметка посещаемости ребёнка на занятии.

## 15.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| lesson_id | UUID | Да | FK → lessons.id |
| child_id | UUID | Да | FK → children.id |
| status | CoachAttendanceStatus | Да | Статус тренера |
| final_status | AdminFinalAttendanceStatus? | Нет | Финальный статус админа |
| absence_reason | AbsenceReason? | Нет | Причина отсутствия |
| marked_by_user_id | UUID? | Нет | FK → users.id |
| marked_at | DateTime? | Нет | Когда отмечено |
| finalized_by_user_id | UUID? | Нет | FK → users.id |
| finalized_at | DateTime? | Нет | Когда финализировано |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 15.3 Связи

```text
attendance_records N → 1 lessons
attendance_records N → 1 children
attendance_records N → 0/1 users as marked_by
attendance_records N → 0/1 users as finalized_by
attendance_records 1 → N lesson_balance_transactions
attendance_records 1 → 0/1 makeup_credits
```

## 15.4 Индексы

```text
idx_attendance_lesson_id(lesson_id)
idx_attendance_child_id(child_id)
idx_attendance_status(status)
idx_attendance_final_status(final_status)
idx_attendance_lesson_child(lesson_id, child_id)
```

## 15.5 Ограничения

```text
UNIQUE(lesson_id, child_id)
```

## 15.6 Правила

- PRESENT списывает 1 занятие;
- ABSENT_UNEXCUSED списывает 1 занятие;
- ABSENT_SICK_PENDING не списывает занятие;
- уважительный final_status создаёт перенос;
- изменения должны попадать в audit log.

---

# 16. Таблица subscriptions

## 16.1 Назначение

Абонемент ребёнка на период с лимитом занятий.

## 16.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| child_id | UUID | Да | FK → children.id |
| period_start | Date | Да | Начало периода |
| period_end | Date | Да | Конец периода |
| planned_lessons_count | Int | Да | Количество занятий |
| lesson_price_kopeks | Int | Да | Цена одного занятия в копейках |
| total_amount_kopeks | Int | Да | Сумма к оплате |
| payment_status | PaymentStatus | Да | Статус оплаты |
| payment_status_changed_at | DateTime? | Нет | Дата изменения статуса |
| payment_status_comment | Text? | Нет | Комментарий к изменению |
| created_by_user_id | UUID | Да | FK → users.id |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 16.3 Связи

```text
subscriptions N → 1 children
subscriptions N → 1 users as created_by
subscriptions 1 → N lesson_balance_transactions
```

## 16.4 Индексы

```text
idx_subscriptions_child_id(child_id)
idx_subscriptions_period(period_start, period_end)
idx_subscriptions_payment_status(payment_status)
```

## 16.5 Правила

- базовая цена занятия — 45000 копеек;
- если ребёнок пришёл в середине месяца, оплачиваются оставшиеся занятия до конца месяца;
- изменение payment_status требует комментарий;
- тренер не видит финансовые поля subscription.

---

# 17. Таблица lesson_balance_transactions

## 17.1 Назначение

Журнал операций по балансу занятий и переносов.

## 17.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| child_id | UUID | Да | FK → children.id |
| subscription_id | UUID? | Нет | FK → subscriptions.id |
| lesson_id | UUID? | Нет | FK → lessons.id |
| attendance_record_id | UUID? | Нет | FK → attendance_records.id |
| makeup_credit_id | UUID? | Нет | FK → makeup_credits.id |
| type | BalanceTransactionType | Да | Тип операции |
| balance_type | BalanceType | Да | LESSON_BALANCE / MAKEUP_BALANCE |
| amount | Int | Да | Изменение: +N или -N |
| reason | String? | Нет | Причина |
| created_by_user_id | UUID? | Нет | FK → users.id |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |

## 17.3 Связи

```text
lesson_balance_transactions N → 1 children
lesson_balance_transactions N → 0/1 subscriptions
lesson_balance_transactions N → 0/1 lessons
lesson_balance_transactions N → 0/1 attendance_records
lesson_balance_transactions N → 0/1 makeup_credits
lesson_balance_transactions N → 0/1 users as created_by
```

## 17.4 Индексы

```text
idx_lbt_school_id(school_id)
idx_lbt_child_id(child_id)
idx_lbt_subscription_id(subscription_id)
idx_lbt_lesson_id(lesson_id)
idx_lbt_attendance_record_id(attendance_record_id)
idx_lbt_makeup_credit_id(makeup_credit_id)
idx_lbt_type(type)
idx_lbt_balance_type(balance_type)
idx_lbt_created_at(created_at)
```

## 17.5 Правила

- любое изменение баланса создаёт запись;
- ручная корректировка требует комментарий;
- amount может быть положительным или отрицательным;
- баланс ребёнка можно вычислить как сумму транзакций;
- cached-балансы в children должны соответствовать сумме транзакций.

---

# 18. Таблица makeup_credits

## 18.1 Назначение

Перенос, который даёт ребёнку +1 доступное занятие или уменьшает будущую оплату.

## 18.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| child_id | UUID | Да | FK → children.id |
| source_lesson_id | UUID? | Нет | FK → lessons.id |
| source_attendance_record_id | UUID? | Нет | FK → attendance_records.id |
| reason | MakeupReason | Да | Причина переноса |
| status | MakeupStatus | Да | Статус переноса |
| assigned_lesson_id | UUID? | Нет | FK → lessons.id |
| assigned_date | Date? | Нет | Назначенная дата |
| created_by_user_id | UUID? | Нет | FK → users.id |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 18.3 Связи

```text
makeup_credits N → 1 schools
makeup_credits N → 1 children
makeup_credits N → 0/1 lessons as source_lesson
makeup_credits N → 0/1 attendance_records
makeup_credits N → 0/1 lessons as assigned_lesson
makeup_credits 1 → N lesson_balance_transactions
```

## 18.4 Индексы

```text
idx_makeup_school_id(school_id)
idx_makeup_child_id(child_id)
idx_makeup_status(status)
idx_makeup_reason(reason)
idx_makeup_assigned_lesson_id(assigned_lesson_id)
```

## 18.5 Правила

- перенос создаётся при подтверждённой болезни, отпуске, карантине или мероприятии;
- перенос можно использовать только в своей группе;
- в v1 у переноса нет срока действия;
- при уходе ребёнка перенос может быть возвращён деньгами после заявления вне системы.

---

# 19. Таблица trial_participants

## 19.1 Назначение

Пробник, записанный на бесплатное первое занятие.

## 19.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| lesson_id | UUID? | Нет | FK → lessons.id |
| group_id | UUID? | Нет | FK → groups.id |
| coach_id | UUID? | Нет | FK → coach_profiles.id |
| converted_child_id | UUID? | Нет | FK → children.id |
| child_name | String? | Нет | Имя ребёнка |
| child_age | Int? | Нет | Возраст |
| parent_name | String? | Нет | Имя родителя |
| parent_phone | String? | Нет | Телефон родителя |
| parent_vk_url | String? | Нет | VK родителя |
| source | TrialSource | Да | Источник |
| status | TrialStatus | Да | Статус пробника |
| comment | Text? | Нет | Комментарий |
| created_by_user_id | UUID? | Нет | FK → users.id |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 19.3 Связи

```text
trial_participants N → 1 schools
trial_participants N → 0/1 lessons
trial_participants N → 0/1 groups
trial_participants N → 0/1 coach_profiles
trial_participants N → 0/1 children as converted_child
```

## 19.4 Индексы

```text
idx_trial_school_id(school_id)
idx_trial_lesson_id(lesson_id)
idx_trial_group_id(group_id)
idx_trial_coach_id(coach_id)
idx_trial_status(status)
idx_trial_source(source)
```

## 19.5 Правила

- поля пробника необязательные;
- пробника может создать ADMIN или COACH;
- пробник отображается у тренера в занятии отдельным блоком;
- после занятия создаётся задача админу;
- только ADMIN/SUPER_ADMIN конвертирует пробника в активного ребёнка.

---

# 20. Таблица group_events

## 20.1 Назначение

Массовое событие группы: карантин, мероприятие сада, праздник, перенос и т.д.

## 20.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| group_id | UUID | Да | FK → groups.id |
| reason | GroupEventReason | Да | Причина |
| action_type | GroupEventActionType | Да | Тип действия |
| period_start | Date | Да | Начало периода |
| period_end | Date | Да | Конец периода |
| created_by_user_id | UUID | Да | FK → users.id |
| comment | Text? | Нет | Комментарий |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 20.3 Связи

```text
group_events N → 1 schools
group_events N → 1 groups
group_events N → 1 users as created_by
```

## 20.4 Индексы

```text
idx_group_events_school_id(school_id)
idx_group_events_group_id(group_id)
idx_group_events_reason(reason)
idx_group_events_period(period_start, period_end)
```

## 20.5 Правила

- карантин только на уровне группы;
- событие применяется к занятиям группы за период;
- при карантине/мероприятии создаются переносы детям;
- действие пишется в audit log.

---

# 21. Таблица tasks

## 21.1 Назначение

Внутренняя задача/уведомление.

## 21.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| type | TaskType | Да | Тип задачи |
| priority | TaskPriority | Да | Приоритет |
| assignee_user_id | UUID? | Нет | FK → users.id |
| related_entity_type | String? | Нет | Тип связанной сущности |
| related_entity_id | UUID? | Нет | ID связанной сущности |
| title | String | Да | Заголовок |
| description | Text? | Нет | Описание |
| status | TaskStatus | Да | OPEN / IN_PROGRESS / CLOSED / CANCELLED |
| due_at | DateTime? | Нет | Дедлайн |
| closed_at | DateTime? | Нет | Когда закрыта |
| closed_by_user_id | UUID? | Нет | FK → users.id |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 21.3 Связи

```text
tasks N → 1 schools
tasks N → 0/1 users as assignee
tasks N → 0/1 users as closed_by
```

## 21.4 Индексы

```text
idx_tasks_school_id(school_id)
idx_tasks_assignee_user_id(assignee_user_id)
idx_tasks_type(type)
idx_tasks_priority(priority)
idx_tasks_status(status)
idx_tasks_due_at(due_at)
idx_tasks_related(related_entity_type, related_entity_id)
```

## 21.5 Правила

- уведомления v1 — это внутренние задачи;
- внешних уведомлений нет;
- задачи остаются открытыми до закрытия;
- критичные задачи должны отображаться в операционном центре.

---

# 22. Таблица audit_logs

## 22.1 Назначение

Журнал важных действий.

## 22.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| user_id | UUID? | Нет | FK → users.id |
| action | String | Да | Название действия |
| entity_type | String | Да | Тип сущности |
| entity_id | UUID | Да | ID сущности |
| old_value | JSON? | Нет | Старое значение |
| new_value | JSON? | Нет | Новое значение |
| comment | Text? | Нет | Комментарий/причина |
| created_at | DateTime | Да | Дата события |

## 22.3 Связи

```text
audit_logs N → 1 schools
audit_logs N → 0/1 users
```

## 22.4 Индексы

```text
idx_audit_school_id(school_id)
idx_audit_user_id(user_id)
idx_audit_entity(entity_type, entity_id)
idx_audit_created_at(created_at)
idx_audit_action(action)
```

## 22.5 Правила

- audit log нельзя редактировать;
- audit log нельзя удалять в v1;
- доступ имеют ADMIN и SUPER_ADMIN;
- COACH не видит audit log.

---

# 23. Таблица import_batches

## 23.1 Назначение

Попытка импорта Excel-файла.

## 23.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| school_id | UUID | Да | FK → schools.id |
| uploaded_by_user_id | UUID | Да | FK → users.id |
| file_name | String | Да | Название файла |
| status | ImportStatus | Да | Статус импорта |
| total_rows | Int | Да | Всего строк |
| success_rows | Int | Да | Успешных строк |
| failed_rows | Int | Да | Ошибочных строк |
| error_report | JSON? | Нет | Общий отчёт об ошибках |
| created_at | DateTime | Да | Дата создания |
| updated_at | DateTime | Да | Дата обновления |

## 23.3 Связи

```text
import_batches N → 1 schools
import_batches N → 1 users as uploaded_by
import_batches 1 → N import_errors
```

## 23.4 Индексы

```text
idx_import_batches_school_id(school_id)
idx_import_batches_status(status)
idx_import_batches_uploaded_by(uploaded_by_user_id)
```

---

# 24. Таблица import_errors

## 24.1 Назначение

Ошибки отдельных строк при импорте.

## 24.2 Поля

| Поле | Тип | Обязательное | Описание |
|---|---|---:|---|
| id | UUID | Да | Primary key |
| import_batch_id | UUID | Да | FK → import_batches.id |
| sheet_name | String | Да | Название листа |
| row_number | Int | Да | Номер строки |
| field_name | String? | Нет | Поле с ошибкой |
| error_message | Text | Да | Описание ошибки |
| raw_row | JSON? | Нет | Данные строки |
| created_at | DateTime | Да | Дата создания |

## 24.3 Связи

```text
import_errors N → 1 import_batches
```

## 24.4 Индексы

```text
idx_import_errors_batch_id(import_batch_id)
idx_import_errors_sheet_row(sheet_name, row_number)
```

---

# 25. Рекомендуемые derived/cached поля

## 25.1 cached_lesson_balance

Таблица:

```text
children.cached_lesson_balance
```

Источник истины:

```text
SUM(lesson_balance_transactions.amount WHERE balance_type = LESSON_BALANCE)
```

## 25.2 cached_makeup_balance

Таблица:

```text
children.cached_makeup_balance
```

Источник истины:

```text
SUM(lesson_balance_transactions.amount WHERE balance_type = MAKEUP_BALANCE)
```

## 25.3 admission_status

Таблица:

```text
children.admission_status
```

Может храниться как cached operational field.

Обновляется при:

- создании абонемента;
- изменении оплаты;
- списании занятия;
- использовании долга;
- достижении баланса -1;
- ручной корректировке.

---

# 26. Ключевые ограничения и проверки

## 26.1 Один ребёнок — одна группа

Реализуется через:

```text
children.current_group_id
```

Ребёнок не может иметь несколько активных групп.

---

## 26.2 Уникальная посещаемость

```text
UNIQUE(attendance_records.lesson_id, attendance_records.child_id)
```

Один ребёнок имеет только одну запись посещаемости на занятие.

---

## 26.3 Уникальное занятие группы в дату/время

```text
UNIQUE(lessons.group_id, lessons.lesson_date, lessons.start_time)
```

Защита от дублей при генерации.

---

## 26.4 Обязательный комментарий при изменении оплаты

При изменении:

```text
subscriptions.payment_status
```

обязателен:

```text
payment_status_comment
```

и обновляется:

```text
payment_status_changed_at
```

---

## 26.5 Обязательный комментарий при ручной корректировке баланса

Для операции:

```text
MANUAL_ADJUSTMENT
```

обязателен:

```text
comment
```

---

## 26.6 Недопуск нельзя обойти

Если:

```text
children.admission_status = NOT_ADMITTED
```

COACH не должен иметь возможность выполнить действие, которое фактически допускает ребёнка вопреки статусу.

---

## 26.7 Не списывать при незаполненном табеле

Если занятие не отмечено до 18:00:

```text
создать Task
не создавать массовые списания
```

---

# 27. Расчётные правила для backend

## 27.1 Списание PRESENT

При `PRESENT`:

```text
create lesson_balance_transaction:
type = PRESENT_DEDUCTION
balance_type = LESSON_BALANCE
amount = -1
```

---

## 27.2 Списание ABSENT_UNEXCUSED

При `ABSENT_UNEXCUSED`:

```text
create lesson_balance_transaction:
type = UNEXCUSED_ABSENCE_DEDUCTION
balance_type = LESSON_BALANCE
amount = -1
```

---

## 27.3 ABSENT_SICK_PENDING

При `ABSENT_SICK_PENDING`:

```text
баланс не меняется
создаётся или ожидается задача админа
планируется sickness follow-up через неделю
```

---

## 27.4 ABSENT_SICK_CONFIRMED

При подтверждённой болезни:

```text
create makeup_credit
create lesson_balance_transaction:
type = SICKNESS_MAKEUP_CREATED
balance_type = MAKEUP_BALANCE
amount = +1
```

---

## 27.5 ABSENT_VACATION_APPROVED

При подтверждённом отпуске:

```text
create makeup_credit
create lesson_balance_transaction:
type = VACATION_MAKEUP_CREATED
balance_type = MAKEUP_BALANCE
amount = +1
```

---

## 27.6 Карантин / мероприятие

При карантине или событии сада:

```text
move lessons
create makeup_credits for children
create lesson_balance_transactions
```

---

## 27.7 Занятие в долг

Если баланс = 0 и ребёнок пришёл:

```text
allow deduction to -1
admission_status = CREDIT_LESSON_USED
create CRITICAL task for admin
```

Если баланс = -1 и оплаты нет:

```text
admission_status = NOT_ADMITTED
coach cannot override
```

---

# 28. Рекомендованные индексы по сценариям

## 28.1 Главный экран тренера

Нужны быстрые запросы:

```text
lessons by coach_id + lesson_date
lessons by substitute_coach_id + lesson_date
attendance_records by lesson_id
trial_participants by lesson_id
```

Индексы:

```text
idx_lessons_coach_date(coach_id, lesson_date)
idx_lessons_substitute_coach_id(substitute_coach_id)
idx_attendance_lesson_id(lesson_id)
idx_trial_lesson_id(lesson_id)
```

---

## 28.2 Операционный центр админа

Нужны запросы:

```text
tasks by status/priority
lessons by date/status
children by admission_status
groups over capacity
makeups by status
trial participants by status
```

Индексы:

```text
idx_tasks_status(status)
idx_tasks_priority(priority)
idx_lessons_date(lesson_date)
idx_lessons_status(status)
idx_children_admission_status(admission_status)
idx_makeup_status(status)
idx_trial_status(status)
```

---

## 28.3 Карточка ребёнка

Нужны запросы:

```text
attendance_records by child_id
subscriptions by child_id
balance_transactions by child_id
makeup_credits by child_id
audit_logs by entity
```

Индексы:

```text
idx_attendance_child_id(child_id)
idx_subscriptions_child_id(child_id)
idx_lbt_child_id(child_id)
idx_makeup_child_id(child_id)
idx_audit_entity(entity_type, entity_id)
```

---

# 29. API visibility rules

## 29.1 Для COACH API не должен возвращать финансовые поля

Для роли COACH не возвращать:

```text
payment_status
lesson_price_kopeks
total_amount_kopeks
payment_status_comment
lesson_balance_transactions
cached_lesson_balance
cached_makeup_balance
financial comments
```

Допустимо возвращать:

```text
admission_status
```

---

## 29.2 ADMIN и SUPER_ADMIN могут видеть финансы

ADMIN/SUPER_ADMIN могут видеть:

- payment_status;
- абонементы;
- балансы;
- операции баланса;
- переносы;
- задолженность;
- комментарии к оплате.

---

# 30. Soft delete / архивирование

## 30.1 Пользователи

```text
users.status = ARCHIVED
```

## 30.2 Дети

```text
children.status = LEFT или ARCHIVED
```

## 30.3 Группы

```text
groups.status = ARCHIVED
```

## 30.4 Филиалы

```text
branches.status = ARCHIVED
```

## 30.5 Занятия

Занятия не удаляются.

Использовать:

```text
lessons.status = CANCELLED
```

---

# 31. Минимальная реализация по milestones

## Milestone 0 — Foundation

Таблицы:

```text
schools
users
admin_profiles
coach_profiles
audit_logs
```

---

## Milestone 1 — Core directories

Таблицы:

```text
branches
parents
children
groups
```

---

## Milestone 2 — Schedule

Таблицы:

```text
schedule_templates
lessons
group_events
```

---

## Milestone 3 — Attendance

Таблицы:

```text
attendance_records
tasks
```

---

## Milestone 4 — Subscriptions and balances

Таблицы:

```text
subscriptions
lesson_balance_transactions
makeup_credits
```

---

## Milestone 5 — Trial lessons

Таблицы:

```text
trial_participants
```

---

## Milestone 6 — Import

Таблицы:

```text
import_batches
import_errors
```

---

# 32. Минимальная ER-карта

```text
schools
 ├── users
 │    ├── admin_profiles
 │    └── coach_profiles
 ├── branches
 │    └── groups
 │         ├── children
 │         │    ├── parents
 │         │    ├── subscriptions
 │         │    ├── lesson_balance_transactions
 │         │    ├── makeup_credits
 │         │    └── attendance_records
 │         ├── schedule_templates
 │         ├── lessons
 │         │    ├── attendance_records
 │         │    └── trial_participants
 │         └── group_events
 ├── tasks
 ├── audit_logs
 └── import_batches
      └── import_errors
```

---

# 33. Проверочные сценарии для Data Model

## 33.1 Ребёнок не может быть в двух группах

Проверка:

```text
children.current_group_id содержит только одну группу.
```

---

## 33.2 Посещение создаёт одну запись на ребёнка и занятие

Проверка:

```text
UNIQUE(lesson_id, child_id)
```

---

## 33.3 Баланс не меняется без транзакции

Проверка:

```text
Любое изменение cached_lesson_balance или cached_makeup_balance происходит только вместе с lesson_balance_transactions.
```

---

## 33.4 Тренер не получает финансы

Проверка:

```text
API для COACH не возвращает поля оплаты и баланса.
```

---

## 33.5 Неотмеченный табель не списывает занятия

Проверка:

```text
ATTENDANCE_NOT_FILLED создаёт Task, но не создаёт BalanceTransaction.
```

---

## 33.6 Подтверждённая болезнь создаёт перенос

Проверка:

```text
ABSENT_SICK_CONFIRMED → makeup_credits + lesson_balance_transactions
```

---

## 33.7 Занятие в долг

Проверка:

```text
Баланс 0 + PRESENT → баланс -1, admission_status = CREDIT_LESSON_USED
```

---

## 33.8 Недопуск

Проверка:

```text
Баланс -1 + нет оплаты до следующего занятия → admission_status = NOT_ADMITTED
```

---

# 34. Открытые технические детали

Критичных продуктовых вопросов для v1 нет.

Технические детали, которые нужно решить при реализации:

- точный ORM;
- формат UUID;
- стратегия миграций;
- правила генерации timestamps;
- способ хранения password_hash;
- формат JSON в audit_logs;
- нужна ли отдельная таблица для group membership history в v2;
- нужны ли database triggers для балансов или вся логика будет в application service;
- нужно ли хранить generated lesson batch id;
- как именно учитывать праздники РФ;
- как именно считать partially filled attendance;
- политика бэкапов.

---

# 35. Ключевой вывод

Data Model v1 должна поддерживать не просто CRUD, а операционную логику школы.

Самые важные технические решения:

```text
1. Баланс через транзакции.
2. Отдельный AdmissionStatus для тренера.
3. Разделение LessonStatus и AttendanceStatus.
4. Разделение LessonBalance и MakeupBalance.
5. Internal Tasks вместо внешних уведомлений.
6. AuditLog для всех критичных действий.
7. School-aware структура для будущего SaaS.
8. Soft delete / archive вместо физического удаления.
```
