# 03_DOMAIN_MODEL.md

# My School — Domain Model

**Проект:** My School  
**Бизнес:** Азбука движения  
**Тип документа:** Domain Model / Модель предметной области  
**Версия:** v1.0  
**Дата:** 2026-06-02  
**Язык:** русский  
**Назначение:** описание ключевых сущностей, связей, инвариантов и доменной логики для проектирования базы данных, backend-логики, UI и задач Codex  

---

## 1. Назначение документа

Этот документ описывает предметную модель продукта **My School** для внутренней системы школы **Азбука движения**.

Документ отвечает на вопросы:

- какие сущности существуют в системе;
- за что отвечает каждая сущность;
- как сущности связаны друг с другом;
- какие статусы и жизненные циклы есть у сущностей;
- какие инварианты нельзя нарушать;
- какие сущности должны быть отдельными, а какие можно хранить как поля;
- какие агрегаты важны для бизнес-логики;
- как модель должна поддерживать будущий SaaS без усложнения v1.

Важно: это **не финальная схема базы данных**, а доменная модель. На её основе позже формируется `06_DATA_MODEL.md`.

---

## 2. Общий взгляд на домен

My School управляет операционной цепочкой детской школы:

```text
School
  → Branch
    → Group
      → Child
      → ScheduleTemplate
        → Lesson
          → AttendanceRecord
            → BalanceTransaction / MakeupCredit / Task
```

Основная бизнес-логика строится вокруг связки:

```text
Child → Subscription → Lesson → Attendance → Balance → AdmissionStatus
```

Главная задача модели — поддержать корректную работу следующих процессов:

- создание филиалов;
- создание групп;
- назначение тренеров;
- создание расписания;
- генерация занятий;
- отметка посещаемости;
- списание занятий;
- учёт болезней;
- учёт отпусков;
- учёт карантинов и мероприятий;
- создание переносов;
- управление абонементами и балансами;
- контроль допуска;
- обработка пробников;
- внутренние задачи;
- audit log.

---

## 3. Принципы доменной модели

## 3.1 Сначала внутренняя система, потом SaaS

В v1 система работает только для одной школы — **Азбука движения**.

Но архитектурно можно заложить сущность `School`, чтобы в будущем адаптировать продукт под SaaS.

Правило:

```text
В интерфейсе v1 не нужно показывать выбор школы.
В модели данных можно хранить school_id для ключевых сущностей.
```

---

## 3.2 Баланс должен считаться через операции

Нельзя хранить баланс занятий только как число без истории.

Правильно:

```text
Child имеет вычисляемый/текущий баланс.
Все изменения баланса проходят через LessonBalanceTransaction.
```

Это нужно для:

- прозрачности;
- спорных ситуаций;
- audit log;
- корректного восстановления истории;
- будущей аналитики.

---

## 3.3 Статус занятия и статус посещаемости — разные вещи

Нельзя смешивать:

```text
Lesson.status
AttendanceRecord.status
```

Пример:

```text
Lesson может быть ATTENDANCE_COMPLETED.
Но внутри него один ребёнок PRESENT, другой ABSENT_UNEXCUSED, третий ABSENT_SICK_PENDING.
```

---

## 3.4 Баланс занятий и баланс переносов — разные понятия

Внутренне нужно разделять:

```text
LessonBalance
MakeupBalance
```

Даже если в UI они отображаются просто.

Причина:

- обычные оплаченные занятия;
- переносы по болезни;
- отпуск;
- карантин;
- мероприятия;
- будущая оплата;
- возвраты при уходе.

---

## 3.5 Тренер не должен знать финансовую детализацию

В доменной модели тренер может видеть только:

```text
AdmissionStatus
```

Но не должен видеть:

- сумму оплаты;
- историю оплат;
- стоимость занятия;
- размер долга в рублях;
- квитанции.

---

## 3.6 Внешние документы не хранятся

В v1 справки и заявления не хранятся файлами.

Система хранит только:

- статус;
- комментарий;
- дедлайн;
- кто подтвердил;
- дату подтверждения.

---

## 4. Высокоуровневая карта сущностей

```text
School
 ├── Branch
 │    └── Group
 │         ├── Child
 │         │    ├── Parent
 │         │    ├── Subscription
 │         │    ├── LessonBalanceTransaction
 │         │    ├── MakeupCredit
 │         │    └── AttendanceRecord
 │         ├── ScheduleTemplate
 │         └── Lesson
 │              ├── AttendanceRecord
 │              ├── TrialParticipant
 │              └── LessonChange
 │
 ├── User
 │    ├── AdminProfile
 │    └── CoachProfile
 │
 ├── Task
 └── AuditLog
```

---

## 5. Агрегаты предметной области

Агрегат — группа сущностей, которые логически изменяются вместе.

## 5.1 Child Aggregate

Центральный агрегат ребёнка.

Содержит:

- Child;
- Parent relation;
- current Group;
- Subscription;
- LessonBalanceTransaction;
- MakeupCredit;
- AdmissionStatus;
- Attendance history;
- child-related Tasks;
- child-related AuditLog.

Ключевой инвариант:

```text
Ребёнок может быть активным участником только одной группы одновременно.
```

---

## 5.2 Group / Schedule Aggregate

Агрегат группы и расписания.

Содержит:

- Group;
- Branch;
- Coach assignment;
- ScheduleTemplate;
- generated Lessons;
- group-level events;
- capacity/occupancy.

Ключевые инварианты:

```text
Группа должна иметь филиал.
Группа должна иметь расписание для генерации занятий.
Если в группе больше 15 детей — создать задачу админу.
```

---

## 5.3 Lesson / Attendance Aggregate

Агрегат занятия и посещаемости.

Содержит:

- Lesson;
- AttendanceRecords;
- TrialParticipants inside lesson;
- coach substitution;
- lesson status;
- attendance status;
- attendance-related balance transactions;
- attendance-related tasks.

Ключевой инвариант:

```text
Неотмеченный табель не должен автоматически списывать занятия всем детям.
```

---

## 5.4 Subscription / Balance Aggregate

Агрегат абонемента и балансов.

Содержит:

- Subscription;
- PaymentStatus;
- LessonBalanceTransaction;
- MakeupCredit;
- AdmissionStatus.

Ключевые инварианты:

```text
Любое изменение баланса должно иметь транзакцию.
Ребёнок может уйти максимум в -1 занятие.
Если баланс -1 и оплаты нет до следующего занятия — ребёнок NOT_ADMITTED.
```

---

## 5.5 Task Aggregate

Агрегат внутренних задач.

Содержит:

- Task;
- priority;
- assignee;
- linked entity;
- status;
- due date;
- close event.

Ключевой инвариант:

```text
Задача остаётся открытой, пока не закрыта пользователем или системным событием.
```

---

## 6. Сущность School

## 6.1 Назначение

`School` представляет школу/организацию.

В v1 фактически существует одна школа:

```text
Азбука движения
```

Но сущность нужна для будущей SaaS-готовности.

## 6.2 Ответственность

- группировать все данные одной школы;
- быть корневой сущностью для филиалов, пользователей, групп и детей;
- подготовить архитектуру к будущему multi-tenant SaaS.

## 6.3 Основные поля

```text
id
name
status
created_at
updated_at
```

## 6.4 Связи

```text
School 1 → N Branch
School 1 → N User
School 1 → N Group
School 1 → N Child
```

## 6.5 Правила v1

- в интерфейсе выбор школы не нужен;
- все создаваемые сущности автоматически относятся к Азбуке движения;
- school_id можно использовать технически.

---

## 7. Сущность Branch

## 7.1 Назначение

`Branch` — филиал/локация, где проходят занятия.

Чаще всего это детский сад.

## 7.2 Ответственность

- хранить адрес;
- группировать группы по локации;
- помогать фильтровать расписание;
- хранить простые заметки по инвентарю/условиям.

## 7.3 Основные поля

```text
id
school_id
name
address
status
inventory_notes
comment
created_at
updated_at
```

## 7.4 Связи

```text
Branch 1 → N Group
Branch 1 → N Lesson
```

## 7.5 Статусы

```text
ACTIVE
INACTIVE
ARCHIVED
```

## 7.6 Правила

- филиалы создаются вручную;
- на старте ожидается примерно 10 филиалов;
- количество филиалов будет расти;
- филиал может быть деактивирован, но не должен физически удаляться при наличии истории.

---

## 8. Сущность User

## 8.1 Назначение

`User` — аккаунт пользователя системы.

Пользователь может быть:

```text
SUPER_ADMIN
ADMIN
COACH
```

## 8.2 Ответственность

- авторизация;
- роль;
- статус активности;
- связь с профилем админа или тренера.

## 8.3 Основные поля

```text
id
school_id
full_name
login
password_hash
role
status
last_login_at
created_at
updated_at
```

## 8.4 Статусы

```text
ACTIVE
INACTIVE
ARCHIVED
```

## 8.5 Связи

```text
User 1 → 0/1 AdminProfile
User 1 → 0/1 CoachProfile
User 1 → N AuditLog
User 1 → N Task
```

## 8.6 Правила

- логин и пароль создаёт SUPER_ADMIN вручную;
- самостоятельной регистрации в v1 нет;
- родительские аккаунты в v1 не создаются;
- восстановление пароля может быть ручным через SUPER_ADMIN.

---

## 9. Сущность AdminProfile

## 9.1 Назначение

`AdminProfile` — профиль администратора.

## 9.2 Ответственность

- хранить дополнительные данные администратора;
- отделять роль пользователя от профиля.

## 9.3 Основные поля

```text
id
user_id
phone
comment
created_at
updated_at
```

## 9.4 Связи

```text
AdminProfile 1 → 1 User
```

## 9.5 Правила

- ADMIN может управлять операционными сущностями;
- SUPER_ADMIN может выполнять все действия ADMIN.

---

## 10. Сущность CoachProfile

## 10.1 Назначение

`CoachProfile` — профиль тренера.

## 10.2 Ответственность

- хранить данные тренера;
- связывать тренера с группами и занятиями;
- определять, какие занятия видит тренер.

## 10.3 Основные поля

```text
id
user_id
phone
comment
status
created_at
updated_at
```

## 10.4 Связи

```text
CoachProfile 1 → 1 User
CoachProfile 1 → N Group as main coach
CoachProfile 1 → N Lesson as assigned coach
CoachProfile 1 → N Lesson as substitute coach
```

## 10.5 Правила

- тренер видит свои занятия;
- тренер видит занятия, где он назначен на замену;
- тренер не видит финансовые детали;
- тренер не может отменять/переносить занятия;
- тренер не может назначать переносы;
- тренер не может обойти NOT_ADMITTED.

---

## 11. Сущность Parent

## 11.1 Назначение

`Parent` — родитель или законный представитель ребёнка.

В v1 родитель не имеет аккаунта в системе.

## 11.2 Ответственность

- хранить контактную информацию;
- связываться с ребёнком;
- помогать тренеру/админу быстро найти телефон/VK.

## 11.3 Основные поля

```text
id
school_id
full_name
phone
vk_profile_url
comment
created_at
updated_at
```

## 11.4 Связи

```text
Parent 1 → N Child
```

## 11.5 Правила

- родитель не входит в систему в v1;
- телефон родителя виден тренеру;
- VK родителя виден тренеру;
- коммуникация остаётся во внешних мессенджерах/VK;
- чат в системе не реализуется.

---

## 12. Сущность Child

## 12.1 Назначение

`Child` — ребёнок, который посещает занятия или является бывшим/пробным участником.

## 12.2 Ответственность

- хранить данные ребёнка;
- хранить связь с родителем;
- хранить текущую группу;
- хранить медицинские ограничения;
- отображать баланс занятий;
- отображать баланс переносов;
- отображать статус оплаты и допуска;
- хранить историю посещаемости.

## 12.3 Основные поля

```text
id
school_id
parent_id
current_group_id
full_name
birth_date
calculated_age
status
medical_notes
coach_comment
admin_comment
payment_status
admission_status
created_at
updated_at
```

## 12.4 Статусы

```text
ACTIVE
PAUSED
LEFT
TRIAL
ARCHIVED
```

## 12.5 Связи

```text
Child N → 1 Parent
Child N → 0/1 Group
Child 1 → N AttendanceRecord
Child 1 → N Subscription
Child 1 → N LessonBalanceTransaction
Child 1 → N MakeupCredit
Child 1 → N Task
Child 1 → N AuditLog
```

## 12.6 Правила

- ребёнок может быть только в одной группе одновременно;
- ребёнок может быть переведён в другую группу;
- история переводов в v1 не обязательна;
- ребёнок не должен физически удаляться при наличии истории;
- для удаления из активной работы использовать `LEFT` или `ARCHIVED`;
- тренер может видеть карточку ребёнка в рамках своих занятий/групп;
- тренер может видеть и редактировать медицинские ограничения;
- тренер не может редактировать admin_comment.

---

## 13. Сущность Group

## 13.1 Назначение

`Group` — группа детей, которая занимается по расписанию в конкретной локации с тренером.

## 13.2 Ответственность

- хранить состав детей;
- хранить основной тренерский состав;
- быть источником расписания;
- быть основой для генерации занятий;
- контролировать заполненность.

## 13.3 Основные поля

```text
id
school_id
branch_id
main_coach_id
name
status
capacity_limit
inventory_notes
comment
created_at
updated_at
```

## 13.4 Статусы

```text
ACTIVE
INACTIVE
ARCHIVED
```

## 13.5 Связи

```text
Group N → 1 Branch
Group N → 1 CoachProfile as main coach
Group 1 → N Child
Group 1 → N ScheduleTemplate
Group 1 → N Lesson
Group 1 → N Task
```

## 13.6 Правила

- группа должна быть привязана к филиалу;
- группа должна иметь основного тренера;
- группа имеет расписание;
- если в группе больше 15 детей, создать задачу админу;
- ребёнок может быть добавлен в группу только если он не состоит в другой активной группе;
- заполненность группы должна быть видна админу.

---

## 14. Сущность ScheduleTemplate

## 14.1 Назначение

`ScheduleTemplate` — шаблон регулярного расписания группы.

## 14.2 Ответственность

- описывать дни и время занятий группы;
- служить основой для генерации занятий на месяц.

## 14.3 Основные поля

```text
id
group_id
branch_id
coach_id
weekday
start_time
end_time
valid_from
valid_to
status
created_at
updated_at
```

## 14.4 Связи

```text
ScheduleTemplate N → 1 Group
ScheduleTemplate N → 1 Branch
ScheduleTemplate N → 1 CoachProfile
ScheduleTemplate 1 → N Lesson
```

## 14.5 Правила

- группа может заниматься 2 раза в неделю в разные дни;
- шаблон используется для генерации занятий на месяц;
- админ может изменить шаблон;
- изменение шаблона не должно автоматически ломать уже созданные занятия без явного действия.

---

## 15. Сущность Lesson

## 15.1 Назначение

`Lesson` — конкретное занятие в конкретную дату и время.

## 15.2 Ответственность

- хранить дату, время, группу и тренера;
- хранить статус занятия;
- хранить посещаемость;
- поддерживать перенос/отмену;
- поддерживать замену тренера;
- быть точкой, где тренер отмечает посещаемость.

## 15.3 Основные поля

```text
id
school_id
group_id
branch_id
schedule_template_id
coach_id
substitute_coach_id
date
start_time
end_time
status
change_reason
comment
created_at
updated_at
```

## 15.4 Статусы

```text
SCHEDULED
ATTENDANCE_PENDING
ATTENDANCE_COMPLETED
MOVED
CANCELLED
```

## 15.5 Связи

```text
Lesson N → 1 Group
Lesson N → 1 Branch
Lesson N → 1 CoachProfile
Lesson N → 0/1 SubstituteCoachProfile
Lesson 1 → N AttendanceRecord
Lesson 1 → N TrialParticipant
Lesson 1 → N Task
```

## 15.6 Правила

- занятия генерируются на месяц из ScheduleTemplate;
- админ может создать занятие вручную;
- админ может перенести занятие;
- перенос группового занятия только меняет дату;
- админ может отменить занятие;
- отменённое школой занятие не списывает абонемент;
- админ может назначить замену тренера;
- тренер видит занятие, если он основной или замещающий тренер.

---

## 16. Сущность AttendanceRecord

## 16.1 Назначение

`AttendanceRecord` — отметка посещаемости конкретного ребёнка на конкретном занятии.

## 16.2 Ответственность

- хранить статус посещаемости;
- запускать списание/ожидание/перенос;
- хранить комментарий;
- фиксировать, кто отметил;
- фиксировать, кто финализировал.

## 16.3 Основные поля

```text
id
lesson_id
child_id
status
final_status
marked_by_user_id
marked_at
finalized_by_user_id
finalized_at
comment
created_at
updated_at
```

## 16.4 Статусы тренера

```text
NOT_MARKED
PRESENT
ABSENT_UNEXCUSED
ABSENT_SICK_PENDING
```

## 16.5 Финальные статусы админа

```text
ABSENT_SICK_CONFIRMED
ABSENT_VACATION_APPROVED
ABSENT_QUARANTINE
ABSENT_EVENT
ABSENT_UNEXCUSED_FINAL
```

## 16.6 Связи

```text
AttendanceRecord N → 1 Lesson
AttendanceRecord N → 1 Child
AttendanceRecord N → 0/1 User as marked_by
AttendanceRecord N → 0/1 User as finalized_by
AttendanceRecord 1 → N LessonBalanceTransaction
AttendanceRecord 1 → 0/1 MakeupCredit
```

## 16.7 Правила

- `PRESENT` списывает 1 занятие;
- `ABSENT_UNEXCUSED` списывает 1 занятие;
- `ABSENT_SICK_PENDING` не списывает занятие;
- финальные уважительные статусы создают перенос;
- изменения посещаемости логируются;
- неотмеченный табель не списывает занятия автоматически.

---

## 17. Сущность Subscription

## 17.1 Назначение

`Subscription` — месячный абонемент ребёнка с лимитом занятий.

## 17.2 Ответственность

- хранить период;
- хранить плановое количество занятий;
- хранить цену занятия;
- хранить статус оплаты;
- служить основанием для начисления баланса.

## 17.3 Основные поля

```text
id
child_id
period_start
period_end
planned_lessons_count
lesson_price
payment_status
payment_status_changed_at
payment_status_comment
created_by_user_id
created_at
updated_at
```

## 17.4 Статусы оплаты

```text
NOT_INVOICED
INVOICED
NOT_PAID
PAID
PARTIALLY_PAID
OVERDUE
```

## 17.5 Связи

```text
Subscription N → 1 Child
Subscription 1 → N LessonBalanceTransaction
Subscription N → 1 User as created_by
```

## 17.6 Правила

- если ребёнок пришёл в середине месяца, оплачиваются только оставшиеся занятия до конца месяца;
- базовая цена занятия 450 рублей;
- возможна индивидуальная цена;
- изменение статуса оплаты требует комментарий;
- дата изменения статуса оплаты хранится;
- тренер не видит финансовые данные абонемента.

---

## 18. Сущность LessonBalanceTransaction

## 18.1 Назначение

`LessonBalanceTransaction` — операция изменения баланса занятий или переносов.

## 18.2 Ответственность

- фиксировать каждое изменение баланса;
- объяснять, почему баланс изменился;
- связывать изменение с занятием, посещаемостью, абонементом или переносом;
- обеспечивать прозрачность.

## 18.3 Основные поля

```text
id
child_id
subscription_id
lesson_id
attendance_record_id
makeup_credit_id
type
amount
balance_type
reason
created_by_user_id
comment
created_at
```

## 18.4 Типы операций

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

## 18.5 Типы баланса

```text
LESSON_BALANCE
MAKEUP_BALANCE
```

## 18.6 Правила

- положительное значение увеличивает баланс;
- отрицательное значение уменьшает баланс;
- любое изменение баланса должно иметь транзакцию;
- ручная корректировка требует комментарий;
- операции должны быть доступны в истории ребёнка.

---

## 19. Сущность MakeupCredit

## 19.1 Назначение

`MakeupCredit` — перенос, дающий ребёнку право на дополнительное занятие или уменьшение будущей оплаты.

## 19.2 Ответственность

- фиксировать основание переноса;
- хранить статус переноса;
- хранить назначенную дату;
- участвовать в расчёте будущей оплаты;
- отображаться в карточке ребёнка и борде переносов.

## 19.3 Основные поля

```text
id
child_id
source_lesson_id
source_attendance_record_id
reason
status
assigned_lesson_id
assigned_date
created_by_user_id
comment
created_at
updated_at
```

## 19.4 Причины

```text
SICKNESS
VACATION
QUARANTINE
KINDERGARTEN_EVENT
OTHER
```

## 19.5 Статусы

```text
AVAILABLE
ASSIGNED
USED
REFUNDED
CANCELLED
```

## 19.6 Связи

```text
MakeupCredit N → 1 Child
MakeupCredit N → 0/1 Lesson as source_lesson
MakeupCredit N → 0/1 AttendanceRecord
MakeupCredit N → 0/1 Lesson as assigned_lesson
MakeupCredit 1 → N LessonBalanceTransaction
```

## 19.7 Правила

- перенос создаёт админ или система по подтверждённой причине;
- перенос можно использовать только в своей группе;
- перенос нельзя использовать в другой группе;
- срок действия в v1 не задан;
- если ребёнок уходит, перенос может быть возвращён деньгами после заявления родителя.

---

## 20. Сущность TrialParticipant

## 20.1 Назначение

`TrialParticipant` — ребёнок, записанный на пробное занятие, но ещё не являющийся полноценным участником группы.

## 20.2 Ответственность

- хранить необязательные контакты пробника;
- отображаться у тренера внутри занятия;
- фиксировать факт прихода/неприхода;
- создавать задачу админу после пробного занятия;
- позволять конвертировать пробника в Child.

## 20.3 Основные поля

```text
id
school_id
lesson_id
group_id
coach_id
child_name
child_age
parent_name
parent_phone
parent_vk_url
source
status
comment
created_by_user_id
created_at
updated_at
```

## 20.4 Статусы

```text
TRIAL_BOOKED
TRIAL_ATTENDED
TRIAL_NO_SHOW
CONTACT_COLLECTED
TRANSFERRED_TO_ADMIN
CONVERTED_TO_ACTIVE
```

## 20.5 Источники

```text
VK
Referral
Kindergarten
Advertising
Other
```

## 20.6 Связи

```text
TrialParticipant N → 1 Lesson
TrialParticipant N → 1 Group
TrialParticipant N → 1 CoachProfile
TrialParticipant N → 0/1 Child after conversion
```

## 20.7 Правила

- поля пробника необязательные;
- пробника может создать админ;
- пробника может добавить тренер;
- пробник отображается отдельным блоком внутри занятия;
- после занятия создаётся задача админу обработать пробника;
- админ может конвертировать пробника в активного ребёнка.

---

## 21. Сущность GroupEvent / MassLessonChange

## 21.1 Назначение

`GroupEvent` или `MassLessonChange` — массовое событие, влияющее на занятия группы.

Примеры:

- карантин;
- мероприятие детского сада;
- праздник;
- перенос группы;
- недоступность тренера;
- другое.

## 21.2 Ответственность

- хранить причину массового изменения;
- хранить период;
- применять изменения к занятиям группы;
- создавать переносы детям при необходимости;
- логировать массовое действие.

## 21.3 Основные поля

```text
id
group_id
reason
period_start
period_end
action_type
created_by_user_id
comment
created_at
updated_at
```

## 21.4 Причины

```text
QUARANTINE
KINDERGARTEN_EVENT
RUSSIAN_HOLIDAY
COACH_UNAVAILABLE
GROUP_TRANSFER
OTHER
```

## 21.5 Типы действия

```text
MOVE_LESSONS
CANCEL_LESSONS
```

## 21.6 Связи

```text
GroupEvent N → 1 Group
GroupEvent 1 → N Lesson affected
GroupEvent 1 → N MakeupCredit generated
```

## 21.7 Правила

- карантин применяется только на уровне группы;
- занятия переносятся;
- детям создаются переносы;
- перенос уменьшает будущую оплату;
- workflow: выбрать группу → период → причину → применить.

---

## 22. Сущность Task

## 22.1 Назначение

`Task` — внутренняя задача/уведомление для админа или тренера.

## 22.2 Ответственность

- фиксировать требуемое действие;
- назначать ответственного;
- иметь приоритет;
- оставаться открытой до закрытия;
- ссылаться на связанную сущность.

## 22.3 Основные поля

```text
id
school_id
type
priority
assignee_user_id
related_entity_type
related_entity_id
title
description
status
due_at
closed_at
closed_by_user_id
created_at
updated_at
```

## 22.4 Статусы

```text
OPEN
IN_PROGRESS
CLOSED
CANCELLED
```

## 22.5 Приоритеты

```text
CRITICAL
HIGH
MEDIUM
LOW
```

## 22.6 Типы задач

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
```

## 22.7 Правила

- задачи не отправляются во внешние каналы в v1;
- задачи отображаются внутри системы;
- задача остаётся открытой, пока не закрыта;
- критичные задачи должны быть видны в операционном центре.

---

## 23. Сущность AuditLog

## 23.1 Назначение

`AuditLog` — журнал важных действий.

## 23.2 Ответственность

- хранить историю изменений;
- помогать разбирать спорные ситуации;
- фиксировать действия с деньгами, балансами, посещаемостью и расписанием.

## 23.3 Основные поля

```text
id
school_id
user_id
action
entity_type
entity_id
old_value
new_value
comment
created_at
```

## 23.4 Что логировать

Обязательно:

- изменение посещаемости;
- изменение статуса оплаты;
- создание/изменение абонемента;
- операции с балансом;
- создание/назначение/использование переноса;
- перенос занятия;
- отмену занятия;
- назначение замены тренера;
- изменение статуса ребёнка;
- изменение медицинских ограничений;
- изменение комментария админа;
- ручные корректировки.

## 23.5 Правила

- audit log нельзя редактировать обычным пользователям;
- audit log нельзя физически удалять в v1;
- записи должны быть доступны SUPER_ADMIN и ADMIN.

---

## 24. Сущность ImportBatch

## 24.1 Назначение

`ImportBatch` — попытка импорта Excel-файла.

## 24.2 Ответственность

- хранить информацию о загрузке;
- хранить статус импорта;
- хранить ошибки;
- позволять понять, что было импортировано.

## 24.3 Основные поля

```text
id
school_id
uploaded_by_user_id
file_name
status
total_rows
success_rows
failed_rows
error_report
created_at
updated_at
```

## 24.4 Статусы

```text
UPLOADED
VALIDATING
VALIDATION_FAILED
READY_TO_IMPORT
IMPORTED
FAILED
```

## 24.5 Правила

- Excel готовит SUPER_ADMIN;
- импорт должен валидировать строки;
- ошибки должны быть показаны пользователю;
- историю, текущие балансы и текущие переносы импортировать не нужно в v1.

---

## 25. Ключевые связи в формате cardinality

```text
School 1 → N Branch
School 1 → N User
School 1 → N Child
School 1 → N Group

Branch 1 → N Group
Branch 1 → N Lesson

User 1 → 0/1 AdminProfile
User 1 → 0/1 CoachProfile

Parent 1 → N Child

Group 1 → N Child
Group 1 → N ScheduleTemplate
Group 1 → N Lesson

CoachProfile 1 → N Group
CoachProfile 1 → N Lesson
CoachProfile 1 → N Lesson as substitute

ScheduleTemplate 1 → N Lesson

Lesson 1 → N AttendanceRecord
Lesson 1 → N TrialParticipant

Child 1 → N AttendanceRecord
Child 1 → N Subscription
Child 1 → N LessonBalanceTransaction
Child 1 → N MakeupCredit

Subscription 1 → N LessonBalanceTransaction

AttendanceRecord 1 → 0/N LessonBalanceTransaction
AttendanceRecord 1 → 0/1 MakeupCredit

MakeupCredit 1 → N LessonBalanceTransaction

Task N → 1 User as assignee
AuditLog N → 1 User as actor
```

---

## 26. Ключевые инварианты

## 26.1 Один ребёнок — одна группа

```text
Child.current_group_id может указывать только на одну активную Group.
```

---

## 26.2 Тренер не видит финансы

```text
COACH не должен иметь доступ к суммам, квитанциям, истории оплат и финансовым расчётам.
```

---

## 26.3 Тренер не может обойти недопуск

```text
Если Child.admission_status = NOT_ADMITTED, COACH не может отметить ребёнка как допущенного вопреки системе.
```

---

## 26.4 Баланс только через транзакции

```text
Любое изменение баланса занятий или переносов должно иметь LessonBalanceTransaction.
```

---

## 26.5 Неотмеченный табель не списывает занятия

```text
Если Lesson не имеет заполненной посещаемости до 18:00, система создаёт Task, но не списывает занятия автоматически.
```

---

## 26.6 Справки не хранятся файлами

```text
Система хранит только статус болезни/справки, но не файл.
```

---

## 26.7 Отпуск не применяется задним числом

```text
ABSENT_VACATION_APPROVED нельзя применять к прошедшим периодам как ретроактивное правило.
```

---

## 26.8 Карантин только на уровне группы

```text
QUARANTINE применяется к Group, не к отдельному Child и не к Branch в v1.
```

---

## 26.9 Перенос только в своей группе

```text
MakeupCredit нельзя использовать в другой группе.
```

---

## 26.10 Внешних уведомлений нет

```text
Все уведомления v1 представлены как внутренние Task.
```

---

## 27. Доменные события

Эти события важны для backend-логики и задач.

## 27.1 AttendanceMarked

Когда тренер сохраняет посещаемость.

Возможные последствия:

- списание занятия;
- создание транзакции;
- обновление статуса занятия;
- audit log.

---

## 27.2 AttendanceNotCompletedBy18

Когда занятие не отмечено до 18:00.

Последствия:

- создать CRITICAL Task тренеру;
- создать CRITICAL Task админу;
- не списывать занятия автоматически.

---

## 27.3 SicknessPendingSet

Когда ребёнку поставлен `ABSENT_SICK_PENDING`.

Последствия:

- не списывать занятие;
- создать/ожидать задачу по справке;
- запланировать follow-up через неделю.

---

## 27.4 SicknessConfirmed

Когда админ подтверждает болезнь.

Последствия:

- создать MakeupCredit;
- создать BalanceTransaction;
- уменьшить будущую оплату;
- закрыть связанные задачи, если применимо;
- audit log.

---

## 27.5 VacationApproved

Когда админ подтверждает отпуск.

Последствия:

- создать MakeupCredit;
- уменьшить будущую оплату;
- audit log.

---

## 27.6 GroupQuarantineApplied

Когда админ применяет карантин к группе.

Последствия:

- перенести занятия;
- создать переносы детям;
- уменьшить будущую оплату;
- audit log.

---

## 27.7 CreditLessonUsed

Когда ребёнок взял занятие в долг.

Последствия:

- баланс становится -1;
- AdmissionStatus = CREDIT_LESSON_USED;
- создать CRITICAL Task админу;
- тренеру показать статус.

---

## 27.8 ChildBecameNotAdmitted

Когда ребёнок не оплатил после использованного долга.

Последствия:

- AdmissionStatus = NOT_ADMITTED;
- тренеру показать недопуск;
- тренер не может обойти блок;
- создать/обновить Task админу.

---

## 27.9 TrialLessonCompleted

Когда занятие с пробником прошло.

Последствия:

- создать HIGH Task админу обработать пробника.

---

## 27.10 GroupOverCapacity

Когда в группе больше 15 детей.

Последствия:

- создать HIGH Task админу.

---

## 28. Границы v1

В доменной модели v1 намеренно отсутствуют:

- ParentAccount;
- ParentLogin;
- ParentCabinet;
- ChatMessage;
- OnlinePayment;
- PaymentProviderTransaction;
- FiscalReceipt;
- Payroll;
- SaaS Subscription for schools;
- Multi-school UI;
- File storage for certificates;
- File storage for vacation requests.

Эти сущности могут появиться в будущих версиях, но не должны реализовываться в v1.

---

## 29. Рекомендации для будущей Data Model

При переходе к `06_DATA_MODEL.md` рекомендуется:

1. Не делать слишком много nullable-полей там, где нужна отдельная сущность.
2. Использовать enum для статусов.
3. Использовать soft delete для детей, групп, филиалов и пользователей.
4. Обязательно индексировать:
   - child_id;
   - group_id;
   - lesson_id;
   - coach_id;
   - branch_id;
   - status;
   - date;
   - assignee_user_id.
5. Для баланса использовать транзакционную модель.
6. Для audit log хранить JSON old_value/new_value.
7. Для задач поддерживать related_entity_type + related_entity_id.
8. Для будущего SaaS учитывать school_id в ключевых таблицах.
9. Не смешивать PaymentStatus и AdmissionStatus.
10. Не смешивать AttendanceStatus и LessonStatus.

---

## 30. Минимальный набор сущностей для старта разработки

Для первого milestone разработки достаточно начать с:

```text
School
User
AdminProfile
CoachProfile
Branch
Parent
Child
Group
ScheduleTemplate
Lesson
```

После этого добавлять:

```text
AttendanceRecord
Subscription
LessonBalanceTransaction
MakeupCredit
Task
AuditLog
TrialParticipant
ImportBatch
```

---

## 31. Итоговая доменная модель

Ключевой центр системы — ребёнок и его операционное состояние:

```text
Child
 ├── Parent
 ├── Group
 ├── Subscription
 ├── AttendanceRecord
 ├── LessonBalanceTransaction
 ├── MakeupCredit
 ├── PaymentStatus
 ├── AdmissionStatus
 └── Task
```

Второй центр — занятие:

```text
Lesson
 ├── Group
 ├── Coach
 ├── SubstituteCoach
 ├── AttendanceRecord
 ├── TrialParticipant
 └── Task
```

Третий центр — операционный контроль:

```text
Task
AuditLog
Operational Center
```

Модель должна поддерживать ежедневные вопросы админа и тренера:

```text
Какие занятия сегодня?
Кто не отметил табель?
Кто пришёл?
Кто отсутствовал?
Кого нельзя допускать?
Кто взял занятие в долг?
Кому нужно назначить перенос?
У кого ждём справку?
Каких пробников нужно обработать?
Какие группы перегружены?
```

Главный принцип модели: **операционная ясность важнее широты функций**.
