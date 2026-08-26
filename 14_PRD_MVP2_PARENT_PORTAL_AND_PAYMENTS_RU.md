# Азбука движения - MVP-2: родительский кабинет и оплаты

**Проект:** Азбука движения
**Бизнес:** Азбука движения
**Тип документа:** Product / Business / Technical Spec
**Версия:** draft v0.1
**Дата:** 2026-07-09
**Язык:** русский
**Статус:** рабочая спецификация для проработки MVP-2
**Фокус:** родительский кабинет + онлайн-оплаты

---

## 1. Назначение документа

Этот документ фиксирует функциональность MVP-2 для Азбука движения: родительский кабинет и оплаты.

MVP-2 должен опираться на уже спроектированное и частично реализованное ядро v1:

```text
Parent
Child
Group
Lesson
AttendanceRecord
Subscription
LessonBalanceTransaction
MakeupCredit
PaymentStatus
AdmissionStatus
Task
AuditLog
```

Главная идея MVP-2: не строить отдельное приложение рядом с системой, а открыть родителю безопасный внешний слой поверх работающего операционного ядра школы.

Документ предназначен для:

- владельца продукта;
- Codex;
- разработчика;
- дизайнера интерфейса;
- администратора школы;
- будущего выбора платёжного провайдера.

---

## 2. Краткое резюме MVP-2

MVP-2 добавляет:

- кабинет родителя в mobile web;
- родительский вход в систему;
- просмотр детей родителя;
- просмотр ближайших занятий;
- просмотр истории посещений;
- просмотр абонемента, баланса занятий и переносов;
- просмотр суммы к оплате;
- онлайн-оплату выставленного счёта;
- автоматическое обновление статуса оплаты после платежа;
- админский контроль счетов, платежей и спорных случаев;
- audit log по финансовым действиям.

MVP-2 не должен становиться:

- нативным iOS/Android-приложением;
- мессенджером;
- полноценной бухгалтерией;
- CRM для лидов;
- публичным SaaS onboarding;
- системой, где родитель сам меняет расписание, посещаемость или баланс.

---

## 3. Продуктовая цель MVP-2

Цель MVP-2:

```text
Родитель сам видит актуальное состояние ребёнка и может оплатить счёт без ручной переписки с админом.
```

Для родителя это означает:

- понятно, когда следующее занятие;
- понятно, сколько занятий осталось;
- понятно, есть ли переносы;
- понятно, что нужно оплатить;
- можно оплатить сразу из кабинета;
- после оплаты статус обновляется без ручного сообщения админу.

Для администратора это означает:

- меньше вопросов в VK/мессенджерах;
- меньше ручной сверки оплат;
- меньше ручных изменений `PaymentStatus`;
- видны неуспешные платежи и спорные случаи;
- финансовые изменения остаются в audit log.

Для бизнеса это означает:

- быстрее собираются оплаты;
- меньше детей попадает в долг из-за забытых напоминаний;
- меньше операционной нагрузки на админа;
- родитель больше доверяет данным школы.

---

## 4. Условия старта реализации

Прорабатывать MVP-2 можно сейчас. Реализовывать в проде стоит после стабилизации v1.

Минимальные условия старта разработки:

- v1 стабильно хранит детей, родителей, группы и расписание;
- абонементы создаются через `Subscription`;
- баланс занятий меняется через `LessonBalanceTransaction`;
- статус допуска работает через `AdmissionStatus`;
- админский блок оплат уже умеет менять `PaymentStatus`;
- критичные финансовые действия пишутся в `AuditLog`;
- есть базовое понимание, как школа сейчас принимает деньги вне системы.

Если часть v1 ещё не готова, MVP-2 можно разбить:

```text
Сначала read-only родительский кабинет.
Затем выставление счетов.
Затем онлайн-оплата и webhook-сверка.
```

---

## 5. Пользователи MVP-2

## 5.1 PARENT

Родитель видит только своих детей и связанные с ними данные.

Родитель может:

- войти в родительский кабинет;
- видеть список своих детей;
- видеть ближайшие занятия ребёнка;
- видеть историю посещений ребёнка;
- видеть текущий абонемент;
- видеть остаток занятий;
- видеть доступные переносы;
- видеть текущие счета;
- оплатить выставленный счёт;
- видеть историю своих платежей.

Родитель не может:

- видеть других детей группы;
- видеть телефоны других родителей;
- видеть внутренние комментарии админа;
- видеть задачи админов и тренеров;
- менять посещаемость;
- менять баланс;
- менять статус оплаты;
- менять статус допуска;
- создавать абонемент;
- назначать переносы;
- отменять занятия.

## 5.2 ADMIN

Админ управляет внешним родительским слоем.

Админ может:

- создать приглашение родителю;
- повторно отправить ссылку активации;
- заблокировать родительский вход;
- видеть счета;
- видеть платежи;
- видеть неуспешные платежи;
- вручную отметить оплату только с комментарием;
- отменить счёт, если он был создан ошибочно;
- открыть спорный платёж и связаться с родителем вне системы.

## 5.3 SUPER_ADMIN

Супер-админ может всё, что может ADMIN, плюс:

- настраивать платёжного провайдера;
- управлять provider credentials;
- включать или выключать онлайн-оплату;
- видеть технические webhook-события;
- запускать ручную пересверку платежей.

## 5.4 COACH

Тренер не получает финансовых прав в MVP-2.

Тренер может косвенно увидеть результат:

```text
Payment success -> обновление допуска -> тренер видит ADMITTED / NOT_ADMITTED.
```

Тренер всё ещё не видит:

- суммы;
- счета;
- платежи;
- историю оплат;
- комментарии к оплате.

---

## 6. Scope MVP-2

## 6.1 Входит

### Родительский аккаунт

- новая роль `PARENT`;
- связь пользователя с существующей карточкой `Parent`;
- логин родителя равен нормализованному номеру телефона из карточки `Parent`;
- приглашение родителя через одноразовую ссылку;
- установка пароля родителем;
- вход по логину/паролю;
- восстановление пароля через одноразовую ссылку;
- блокировка родительского аккаунта админом.

### Родительский кабинет

- главная страница родителя;
- список детей родителя;
- карточка ребёнка для родителя;
- ближайшие занятия;
- история посещений;
- текущий абонемент;
- баланс занятий;
- баланс переносов;
- статус допуска в понятной родителю формулировке;
- текущие счета;
- история платежей.

### Оплаты

- модель счёта к оплате;
- генерация счёта на основе абонемента;
- кнопка оплаты из родительского кабинета;
- создание платежной попытки;
- redirect на платёжную страницу провайдера или embedded checkout, если выбранный провайдер это поддерживает;
- обработка webhook от провайдера;
- idempotency, чтобы повторный webhook не дублировал оплату;
- обновление счёта после успешной оплаты;
- обновление `Subscription.paymentStatus`;
- пересчёт `AdmissionStatus`, если оплата влияет на допуск;
- отображение неуспешных платежей админу.

### Админский контроль

- список родительских аккаунтов;
- список счетов;
- список платежей;
- ручная отметка оплаты с обязательным комментарием;
- ручная отмена ошибочного счёта с обязательным комментарием;
- audit log для всех финансовых изменений;
- задача админу, если платёж не удалось обработать автоматически.

## 6.2 Не входит

Не включать в MVP-2:

- нативные мобильные приложения;
- Telegram/VK bot;
- SMS, email и push-уведомления;
- внутренний чат с родителем;
- самостоятельный выбор даты переноса родителем;
- самостоятельная отмена посещения родителем;
- загрузка справок файлами;
- загрузка заявлений на отпуск файлами;
- полноценная бухгалтерия;
- расчёт зарплаты тренеров;
- возвраты как автоматический финансовый процесс;
- multi-school UI;
- публичный SaaS onboarding;
- маркетинговые цепочки;
- скидки, промокоды, семейные тарифы;
- сложные рассрочки.

---

## 7. Ключевой продуктовый принцип

Родительский кабинет должен быть read-friendly, а не admin-lite.

Правильно:

```text
Родитель видит понятное состояние:
"Следующее занятие во вторник"
"Осталось 3 занятия"
"Доступен 1 перенос"
"К оплате 3600 ₽ до 10 июля"
```

Неправильно:

```text
Родитель видит внутренние enum, audit log, задачи, ручные корректировки и технические комментарии.
```

Внешний слой должен переводить внутренние статусы в человеческий язык, но не скрывать важные проблемы.

---

## 8. Информационная архитектура

## 8.1 Parent navigation

Минимальная навигация родителя:

```text
/parent
/parent/children/[childId]
/parent/payments
/parent/profile
```

### `/parent`

Главная страница родителя:

- дети родителя;
- ближайшее занятие по каждому ребёнку;
- текущий статус оплаты;
- главный CTA оплаты, если есть открытый счёт;
- короткий блок переносов.

### `/parent/children/[childId]`

Карточка ребёнка:

- имя ребёнка;
- группа;
- филиал;
- ближайшие занятия;
- история посещений;
- баланс занятий;
- баланс переносов;
- текущий абонемент;
- счета, связанные с ребёнком.

### `/parent/payments`

Оплаты:

- открытые счета;
- оплаченные счета;
- неуспешные попытки;
- суммы;
- даты;
- статусы.

### `/parent/profile`

Профиль:

- ФИО родителя;
- телефон;
- VK-ссылка, если есть;
- список детей;
- кнопка выхода.

В MVP-2 родитель не редактирует профиль напрямую. Если данные неверные, он связывается со школой вне системы. Редактирование профиля можно добавить позже.

## 8.2 Admin additions

Новые админские разделы или подстраницы:

```text
/admin/parents/accounts
/admin/payments/invoices
/admin/payments/transactions
/admin/payments/settings
```

Если не хочется расширять навигацию, MVP-2 можно начать с двух мест:

```text
/admin/directories -> родительские аккаунты
/admin/billing -> счета и платежи
```

---

## 9. Родительский кабинет: UI требования

## 9.1 Общий стиль

Кабинет родителя должен быть mobile-first.

Главный пользовательский сценарий:

```text
Родитель открывает ссылку с телефона -> видит, нужно ли платить -> платит -> возвращается в кабинет.
```

UI должен быть спокойным и понятным. Это не маркетинговая страница и не лендинг.

## 9.2 Главная родителя

На первом экране должны быть:

- имя ребёнка;
- ближайшее занятие;
- статус оплаты;
- сумма к оплате, если есть открытый счёт;
- кнопка "Оплатить";
- остаток занятий;
- переносы.

Если детей несколько, сначала показывать общий список детей с кратким статусом по каждому.

## 9.3 Статус допуска для родителя

Внутренние статусы:

```text
ADMITTED
CREDIT_LESSON_USED
NOT_ADMITTED
```

Родительские формулировки:

| Внутренний статус | Текст для родителя | UI тон |
|---|---|---|
| `ADMITTED` | Можно посещать занятия | Нейтральный |
| `CREDIT_LESSON_USED` | Есть занятие в долг, нужна оплата до следующего занятия | Предупреждение |
| `NOT_ADMITTED` | Нужно оплатить или связаться со школой перед занятием | Критично |

Не показывать родителю текст `NOT_ADMITTED` как технический enum.

## 9.4 История посещений

Показывать:

- дату занятия;
- группу;
- время;
- статус присутствия;
- была ли отработка или перенос, если это уже подтверждено админом.

Не показывать:

- внутренние комментарии тренера;
- внутренние комментарии админа;
- историю изменения табеля;
- кто именно поменял статус.

## 9.5 Балансы и переносы

Показывать отдельно:

```text
Остаток занятий
Доступные переносы
Назначенные переносы
Использованные переносы
```

Родителю не нужно видеть все `LessonBalanceTransaction` как бухгалтерскую проводку. Для доверия можно показать короткую историю:

```text
+8 занятий: абонемент за июль
-1 занятие: посещение 03.07
+1 перенос: болезнь подтверждена
```

Если история спорная, админ разбирает её во внутреннем интерфейсе.

---

## 10. Оплаты: доменная модель

## 10.1 Почему текущего `PaymentStatus` недостаточно

В v1 уже есть:

```text
Subscription.paymentStatus
Subscription.totalAmountKopeks
Subscription.paymentStatusComment
```

Этого достаточно для ручной операционной отметки оплаты.

Для онлайн-оплаты этого недостаточно, потому что нужно различать:

```text
Счёт, который школа выставила
Платёжную попытку родителя
Реально полученный платёж
Webhook от провайдера
Ручную корректировку админа
```

MVP-2 должен добавить отдельные сущности для счёта и платежа.

## 10.2 Основные понятия

### Invoice

Счёт к оплате.

Отвечает на вопрос:

```text
Что родитель должен оплатить?
```

### Payment

Факт или попытка оплаты.

Отвечает на вопрос:

```text
Что произошло с деньгами?
```

### PaymentAttempt

Одна попытка перейти к оплате у провайдера.

Нужна, потому что родитель может:

- открыть оплату и закрыть страницу;
- попытаться оплатить несколько раз;
- получить ошибку карты;
- оплатить позже.

### PaymentWebhookEvent

Сырое событие от платёжного провайдера.

Нужно для:

- idempotency;
- диагностики;
- повторной обработки;
- защиты от дублирования платежей.

## 10.3 Рекомендуемые таблицы

```text
parent_accounts
parent_invites
password_reset_tokens
invoices
payments
payment_attempts
payment_webhook_events
```

## 10.4 ParentAccount

Связь системного пользователя с карточкой родителя.

```text
parent_accounts
  id
  school_id
  user_id
  parent_id
  status
  activated_at
  blocked_at
  created_at
  updated_at
```

Рекомендуемый enum:

```text
ParentAccountStatus
  INVITED
  ACTIVE
  BLOCKED
  ARCHIVED
```

Инварианты:

- `user.role = PARENT`;
- один `ParentAccount` связан с одним `Parent`;
- `user.login` для родителя хранит нормализованный телефон родителя;
- телефон родителя должен быть уникален в рамках школы для активных родительских аккаунтов;
- родитель видит детей только через `children.parent_id = parent_accounts.parent_id`;
- если аккаунт заблокирован, вход запрещён.

## 10.5 ParentInvite

Одноразовое приглашение родителя.

```text
parent_invites
  id
  school_id
  parent_id
  token_hash
  expires_at
  used_at
  created_by_user_id
  created_at
```

Правила:

- токен хранить только как hash;
- ссылка одноразовая;
- срок жизни по умолчанию 7 дней;
- приглашение нельзя создать, если у `Parent` нет телефона;
- приглашение нельзя создать, если такой нормализованный телефон уже используется другим активным родительским аккаунтом в этой школе;
- повторная отправка создаёт новый invite и инвалидирует старый активный invite;
- invite отправляется родителю через текущий внешний канал вручную, пока нет SMS/VK/Telegram integration.

## 10.6 PasswordResetToken

Одноразовая ссылка восстановления пароля.

```text
password_reset_tokens
  id
  school_id
  user_id
  token_hash
  expires_at
  used_at
  created_by_user_id
  created_at
```

Правила:

- токен хранить только как hash;
- ссылка одноразовая;
- срок жизни по умолчанию 60 минут;
- повторный reset request инвалидирует старый активный token этого пользователя;
- после успешной смены пароля все активные сессии родителя инвалидируются;
- заблокированный `ParentAccount` не может восстановить пароль без разблокировки админом;
- в MVP-2 базовый сценарий восстановления может быть admin-assisted: админ генерирует ссылку и отправляет её родителю через текущий внешний канал;
- автоматическая отправка ссылки через email/SMS/VK/Telegram является расширением после выбора канала уведомлений.

## 10.7 Invoice

```text
invoices
  id
  school_id
  parent_id
  child_id
  subscription_id
  number
  status
  amount_kopeks
  paid_amount_kopeks
  currency
  period_start
  period_end
  due_date
  issued_at
  paid_at
  cancelled_at
  created_by_user_id
  created_at
  updated_at
```

Рекомендуемый enum:

```text
InvoiceStatus
  DRAFT
  ISSUED
  PAYMENT_PENDING
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
```

MVP-2 правило:

```text
Один счёт обычно связан с одним абонементом одного ребёнка.
```

Семейные счета на нескольких детей можно добавить позже.

## 10.8 PaymentAttempt

```text
payment_attempts
  id
  school_id
  invoice_id
  parent_id
  provider
  provider_payment_id
  status
  checkout_url
  amount_kopeks
  currency
  expires_at
  created_at
  updated_at
```

Рекомендуемый enum:

```text
PaymentAttemptStatus
  CREATED
  REDIRECTED
  PENDING
  SUCCEEDED
  FAILED
  EXPIRED
  CANCELLED
```

## 10.9 Payment

```text
payments
  id
  school_id
  invoice_id
  parent_id
  child_id
  subscription_id
  provider
  provider_payment_id
  status
  amount_kopeks
  currency
  paid_at
  failed_at
  failure_reason
  created_at
  updated_at
```

Рекомендуемый enum:

```text
PaymentRecordStatus
  PENDING
  SUCCEEDED
  FAILED
  CANCELLED
  REFUNDED
```

В MVP-2 фактическая успешная оплата - это `Payment.status = SUCCEEDED`.

## 10.10 PaymentWebhookEvent

```text
payment_webhook_events
  id
  school_id
  provider
  provider_event_id
  provider_payment_id
  event_type
  signature_valid
  payload
  received_at
  processed_at
  processing_error
```

Инварианты:

- webhook endpoint не требует пользовательскую сессию;
- webhook endpoint обязан проверить подпись провайдера;
- `provider_event_id` должен быть уникальным для провайдера;
- повторное событие не создаёт второй платёж;
- сырое событие хранится для диагностики.

---

## 11. Связь оплат с текущей v1 логикой

## 11.1 Source of truth

В MVP-2:

```text
Invoice показывает, что нужно оплатить.
Payment показывает, что реально произошло.
Subscription.paymentStatus остаётся операционным кешем для v1-логики допуска.
```

Это значит:

- успешный `Payment` обновляет `Invoice`;
- оплаченный `Invoice` обновляет `Subscription.paymentStatus`;
- изменение `Subscription.paymentStatus` должно писать audit log;
- если оплата влияет на допуск, система пересчитывает `AdmissionStatus`.

## 11.2 Создание абонемента и счёта

Рекомендуемый поток:

```text
ADMIN создаёт Subscription
Система начисляет LessonBalanceTransaction
Система создаёт Invoice
Родитель видит Invoice в кабинете
Родитель оплачивает Invoice
Webhook подтверждает Payment
Invoice становится PAID
Subscription.paymentStatus становится PAID
AdmissionStatus пересчитывается
```

## 11.3 Ручная оплата

Если родитель оплатил вне системы, админ может отметить счёт как оплаченный вручную.

Правила:

- комментарий обязателен;
- нужно указать источник, например `cash`, `bank_transfer`, `manual_correction`;
- создаётся `Payment` со статусом `SUCCEEDED` и source `MANUAL`;
- создаётся audit log;
- `Subscription.paymentStatus` обновляется по тем же правилам, что и при онлайн-оплате.

## 11.4 Частичная оплата

Для MVP-2 частичная оплата допускается только как статус и админский случай.

Родительский happy path:

```text
Оплатить счёт полностью.
```

Если провайдер или админ фиксирует меньшую сумму:

- `Invoice.status = PARTIALLY_PAID`;
- `Subscription.paymentStatus = PARTIALLY_PAID`;
- админу создаётся задача проверить ситуацию;
- родитель видит остаток к оплате.

## 11.5 Возвраты

Автоматические возвраты не входят в MVP-2.

В MVP-2 можно хранить статус `REFUNDED` для будущего, но сам процесс возврата выполняется вне системы или через админа после отдельного решения.

---

## 12. Платёжный провайдер

MVP-2 не фиксирует конкретного провайдера.

Причина:

- тарифы и условия меняются;
- юридические требования нужно подтвердить с бухгалтером и провайдером;
- школа может выбрать эквайринг, СБП или агрегатора;
- архитектура не должна зависеть от одного vendor SDK.

Требования к интеграционному слою:

- provider adapter interface;
- server-side создание платежа;
- webhook verification;
- idempotent event processing;
- sandbox режим;
- хранение provider payment id;
- понятные ошибки для админа;
- отсутствие provider secrets на клиенте.

Минимальный интерфейс адаптера:

```ts
type PaymentProviderAdapter = {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhook(request: Request): Promise<VerifiedWebhookEvent>;
  mapWebhookToPayment(event: VerifiedWebhookEvent): PaymentProviderResult;
};
```

Выбор провайдера - отдельное решение перед реализацией `MVP2-05`.

---

## 13. Auth и RBAC

## 13.1 UserRole

Добавить роль:

```text
PARENT
```

Обновить редирект после логина:

```text
COACH -> /coach
PARENT -> /parent
SUPER_ADMIN / ADMIN -> /admin
```

## 13.2 Parent login policy

Для родителя логин должен быть номером телефона.

Правило:

```text
Parent.phone -> normalizePhone() -> User.login
```

Требования:

- номер телефона обязателен для активации родительского кабинета;
- пароль родитель задаёт сам по invite link;
- телефон нужно нормализовать до единого формата до записи в `User.login`;
- рекомендуемый формат хранения логина: цифры с кодом страны, например `79991234567`;
- отображать телефон в UI можно в привычном формате, но сравнение и login должны использовать нормализованное значение;
- в рамках одной школы не может быть двух активных `PARENT` пользователей с одинаковым нормализованным телефоном;
- если телефон родителя меняет ADMIN, система должна проверить уникальность и обновить `User.login` связанного родительского аккаунта;
- смена телефона родителя должна писать audit log.

Ошибки, которые нужно показать админу:

```text
Нельзя создать родительский вход: у родителя не указан телефон.
Нельзя создать родительский вход: этот телефон уже используется другим родителем.
```

## 13.3 Parent guards

Нужны отдельные backend guards:

```text
requireParentUser()
requireParentChildAccess(childId)
requireParentInvoiceAccess(invoiceId)
```

Правило:

```text
Parent API не принимает parentId от клиента как источник истины.
```

`parentId` всегда берётся из текущей сессии:

```text
Session -> User -> ParentAccount -> Parent -> Children
```

## 13.4 Доступ родителя к данным

Родитель может читать:

- своих детей;
- группы своих детей, без списка других детей;
- расписание своих детей;
- посещаемость своих детей;
- абонементы своих детей;
- счета своих детей;
- платежи по своим счетам;
- свои контактные данные.

Родитель не может читать:

- всех детей школы;
- детей группы;
- других родителей;
- телефоны тренеров, если школа отдельно это не разрешила;
- внутренние задачи;
- audit log;
- admin comments;
- coach comments, если они внутренние;
- raw webhook payload;
- provider technical errors.

## 13.5 API visibility invariant

Запрещено решать безопасность только через frontend.

Каждый parent endpoint должен фильтровать данные на backend.

Обязательный тест:

```text
Parent A не может получить childId / invoiceId / paymentId Parent B.
```

---

## 14. API surface MVP-2

## 14.1 Parent auth API

```text
POST /api/auth/parent/password-reset/confirm
```

Опционально после появления автоматического канала доставки:

```text
POST /api/auth/parent/password-reset/request
```

В базовом MVP-2 reset link создаёт админ, поэтому публичный request endpoint можно не включать в первый релиз.

## 14.2 Parent API

```text
GET  /api/parent/me
GET  /api/parent/children
GET  /api/parent/children/[id]
GET  /api/parent/children/[id]/schedule
GET  /api/parent/children/[id]/attendance
GET  /api/parent/children/[id]/balances
GET  /api/parent/invoices
GET  /api/parent/invoices/[id]
POST /api/parent/invoices/[id]/payment-attempts
GET  /api/parent/payments
```

## 14.3 Admin API

```text
GET  /api/admin/parent-accounts
POST /api/admin/parent-accounts/invites
POST /api/admin/parent-accounts/[id]/password-reset
POST /api/admin/parent-accounts/[id]/block
POST /api/admin/parent-accounts/[id]/unblock
GET  /api/admin/invoices
POST /api/admin/invoices
PATCH /api/admin/invoices/[id]
POST /api/admin/invoices/[id]/mark-paid
POST /api/admin/invoices/[id]/cancel
GET  /api/admin/payments
GET  /api/admin/payment-webhook-events
POST /api/admin/payments/reconcile
```

## 14.4 Provider API

```text
POST /api/payments/webhooks/[provider]
```

Provider webhook endpoint:

- не использует user session;
- проверяет подпись;
- сохраняет raw event;
- обрабатывает событие идемпотентно;
- возвращает успешный HTTP-ответ только после безопасного сохранения события.

---

## 15. User flows

## Flow MVP2-01 - Активация родительского кабинета

**Цель:** родитель получает доступ к кабинету.

Шаги:

1. ADMIN открывает карточку родителя.
2. Система проверяет, что у родителя есть уникальный телефон.
3. ADMIN нажимает "Создать приглашение".
4. Система создаёт `ParentInvite`.
5. ADMIN копирует ссылку и отправляет родителю во внешнем канале.
6. Родитель открывает ссылку.
7. Родитель задаёт пароль.
8. Система создаёт или активирует `User(role=PARENT)` с логином, равным нормализованному телефону.
9. Система создаёт или активирует `ParentAccount`.
10. Родитель попадает в `/parent`.

Ошибки:

- телефон родителя не указан;
- телефон уже используется другим родительским аккаунтом;
- ссылка истекла;
- ссылка уже использована;
- родитель заблокирован;
- родитель не привязан ни к одному ребёнку.

## Flow MVP2-02 - Родитель восстанавливает пароль

**Цель:** родитель может вернуть доступ к кабинету без создания нового аккаунта.

Базовый MVP-2 сценарий без внешних уведомлений:

1. Родитель пишет админу вне системы, что забыл пароль.
2. ADMIN открывает родительский аккаунт.
3. ADMIN нажимает "Сбросить пароль".
4. Система создаёт одноразовый `PasswordResetToken`.
5. ADMIN отправляет ссылку родителю через текущий внешний канал.
6. Родитель открывает ссылку.
7. Родитель задаёт новый пароль.
8. Система инвалидирует token и активные сессии родителя.
9. Родитель входит по номеру телефона и новому паролю.

Расширение после появления канала уведомлений:

```text
Родитель нажимает "Забыли пароль?" -> система сама отправляет reset link.
```

Ошибки:

- ссылка истекла;
- ссылка уже использована;
- аккаунт заблокирован;
- пользователь не является родителем.

## Flow MVP2-03 - Родитель смотрит ближайшее занятие

**Цель:** родитель понимает, когда и куда прийти.

Шаги:

1. Родитель входит в кабинет.
2. Система показывает детей родителя.
3. Родитель открывает ребёнка.
4. Система показывает ближайшие занятия ребёнка.

Данные:

- дата;
- время;
- группа;
- филиал;
- статус занятия;
- отметка о переносе или отмене, если занятие изменено.

## Flow MVP2-04 - Родитель смотрит оплату

**Цель:** родитель понимает, что нужно оплатить.

Шаги:

1. Родитель открывает `/parent/payments`.
2. Система показывает открытые счета.
3. Родитель видит сумму, период, ребёнка и срок оплаты.
4. Если счёт открыт, родитель видит кнопку "Оплатить".

## Flow MVP2-05 - Родитель оплачивает счёт

**Цель:** родитель оплачивает текущий счёт.

Шаги:

1. Родитель нажимает "Оплатить".
2. Backend проверяет, что счёт принадлежит этому родителю.
3. Backend создаёт `PaymentAttempt`.
4. Backend получает checkout URL у провайдера.
5. Родитель переходит на оплату.
6. Провайдер отправляет webhook.
7. Система сохраняет `PaymentWebhookEvent`.
8. Система создаёт или обновляет `Payment`.
9. Система обновляет `Invoice`.
10. Система обновляет `Subscription.paymentStatus`.
11. Система пересчитывает `AdmissionStatus`.
12. Родитель видит оплату в кабинете.

## Flow MVP2-06 - Платёж не прошёл

**Цель:** родитель и админ видят понятное состояние.

Шаги:

1. Родитель пытается оплатить.
2. Провайдер возвращает ошибку или webhook `failed`.
3. Система обновляет `PaymentAttempt`.
4. Счёт остаётся открытым.
5. Родитель видит, что оплата не прошла.
6. Админ видит неуспешную попытку в списке платежей.

Не делать:

- не менять `Subscription.paymentStatus` на `PAID`;
- не менять допуск на основании failed attempt;
- не создавать дублирующую оплату при повторной попытке.

## Flow MVP2-07 - Ручная отметка оплаты админом

**Цель:** обработать оплату, которая прошла вне онлайн-провайдера.

Шаги:

1. ADMIN открывает счёт.
2. ADMIN нажимает "Отметить оплачено вручную".
3. ADMIN указывает сумму, дату и комментарий.
4. Система создаёт `Payment(source=MANUAL, status=SUCCEEDED)`.
5. Система обновляет `Invoice`.
6. Система обновляет `Subscription.paymentStatus`.
7. Система пишет audit log.

## Flow MVP2-08 - Родитель с несколькими детьми

**Цель:** родитель видит каждого ребёнка отдельно.

Шаги:

1. Родитель входит в кабинет.
2. Система показывает всех детей, связанных с `Parent`.
3. По каждому ребёнку показываются отдельные занятия, балансы и счета.
4. Платёж всегда связан с конкретным счётом и ребёнком.

MVP-2 не объединяет счета нескольких детей в один семейный счёт.

---

## 16. Business rules

## 16.1 Счёт

- счёт создаётся только для существующего `Parent`;
- счёт создаётся только для ребёнка этого родителя;
- счёт хранит сумму в копейках;
- валюта MVP-2: `RUB`;
- сумма счёта не может быть отрицательной;
- оплаченный счёт нельзя редактировать без отдельной корректировки;
- отменённый счёт нельзя оплатить;
- просроченный счёт может быть оплачен, если админ не отменил его.

## 16.2 Платёж

- успешный платёж не создаётся из frontend-события;
- успешный платёж создаётся только после provider webhook или ручного действия админа;
- один provider payment id не может создать два успешных платежа;
- сумма успешного платежа должна совпадать со счётом или переводить счёт в `PARTIALLY_PAID`;
- failed payment не влияет на допуск;
- payment attempt может быть несколько, payment success должен быть один на полную оплату счёта.

## 16.3 Допуск после оплаты

После успешной оплаты система должна:

1. Обновить счёт.
2. Обновить `Subscription.paymentStatus`.
3. Пересчитать `AdmissionStatus` ребёнка.
4. Закрыть или обновить открытые задачи по недопуску, если проблема решена.

Правило:

```text
Оплата сама по себе не создаёт занятия в балансе, если для этого уже был создан Subscription.
```

Баланс занятий меняется через `LessonBalanceTransaction`, как в v1.

## 16.4 Срок оплаты

У счёта должен быть `due_date`.

Если `due_date` прошёл и счёт не оплачен:

- `Invoice.status = OVERDUE`;
- `Subscription.paymentStatus = OVERDUE`, если счёт связан с текущим абонементом;
- админу создаётся или обновляется задача;
- родитель видит предупреждение.

## 16.5 Audit log

Писать audit log для:

- создания родительского приглашения;
- активации родительского аккаунта;
- блокировки родительского аккаунта;
- создания счёта;
- отмены счёта;
- успешного платежа;
- ручной отметки оплаты;
- изменения статуса оплаты;
- ошибки webhook, если она требует ручного вмешательства.

---

## 17. Acceptance criteria

## AC-MVP2-AUTH-001 - Parent role существует

**Given:** в системе есть роли пользователей
**When:** реализуется MVP-2
**Then:** добавлена роль `PARENT`, и она не имеет доступа к `/admin` и `/coach`.

## AC-MVP2-AUTH-002 - Parent redirect

**Given:** родитель успешно вошёл
**When:** система обрабатывает redirect после логина
**Then:** родитель попадает в `/parent`.

## AC-MVP2-AUTH-003 - Parent invite одноразовый

**Given:** ADMIN создал приглашение родителю
**When:** родитель использовал ссылку
**Then:** повторное использование той же ссылки невозможно.

## AC-MVP2-AUTH-004 - Телефон родителя является логином

**Given:** у родителя указан телефон
**When:** родитель активирует кабинет
**Then:** система создаёт `User(role=PARENT)` с `login`, равным нормализованному телефону родителя.

## AC-MVP2-AUTH-005 - Родитель задаёт пароль сам

**Given:** родитель открыл валидную invite link
**When:** он задаёт пароль
**Then:** пароль сохраняется как hash, а исходный пароль не хранится в системе.

## AC-MVP2-AUTH-006 - Дубли телефонов блокируют invite

**Given:** нормализованный телефон уже используется другим активным родительским аккаунтом
**When:** ADMIN создаёт invite для родителя с тем же телефоном
**Then:** система не создаёт invite и показывает понятную ошибку.

## AC-MVP2-AUTH-007 - Родитель может восстановить пароль

**Given:** у родителя есть активный аккаунт
**When:** ADMIN создаёт reset link, а родитель задаёт новый пароль по этой ссылке
**Then:** старый пароль больше не подходит, token становится использованным, активные сессии родителя инвалидируются.

## AC-MVP2-RBAC-001 - Родитель видит только своих детей

**Given:** Parent A и Parent B имеют разных детей
**When:** Parent A запрашивает childId Parent B
**Then:** API возвращает отказ и не раскрывает данные ребёнка.

## AC-MVP2-RBAC-002 - Parent API не доверяет parentId из клиента

**Given:** родитель отправляет чужой `parentId` в запросе
**When:** backend обрабатывает запрос
**Then:** backend использует `parentId` из сессии, а не из тела запроса.

## AC-MVP2-CABINET-001 - Главная родителя показывает детей

**Given:** родитель привязан к одному или нескольким детям
**When:** он открывает `/parent`
**Then:** система показывает только его детей и краткий статус по каждому.

## AC-MVP2-CABINET-002 - Родитель видит ближайшие занятия

**Given:** у ребёнка есть будущие занятия
**When:** родитель открывает карточку ребёнка
**Then:** он видит даты, время, группу, филиал и статус ближайших занятий.

## AC-MVP2-CABINET-003 - Родитель видит балансы

**Given:** у ребёнка есть баланс занятий и переносов
**When:** родитель открывает карточку ребёнка
**Then:** он видит остаток занятий и доступные переносы в понятной форме.

## AC-MVP2-CABINET-004 - Родитель не видит внутренние комментарии

**Given:** в карточке ребёнка есть `adminComment` или внутренний `coachComment`
**When:** родитель открывает карточку ребёнка
**Then:** эти поля не присутствуют в API-ответе и UI.

## AC-MVP2-INVOICE-001 - ADMIN может создать счёт

**Given:** у ребёнка есть родитель и абонемент
**When:** ADMIN создаёт счёт
**Then:** счёт связан с родителем, ребёнком и абонементом.

## AC-MVP2-INVOICE-002 - Родитель видит открытый счёт

**Given:** у родителя есть `Invoice.status = ISSUED`
**When:** родитель открывает оплаты
**Then:** он видит сумму, период, ребёнка, срок оплаты и кнопку оплаты.

## AC-MVP2-PAY-001 - Родитель может начать оплату

**Given:** у родителя есть открытый счёт
**When:** он нажимает "Оплатить"
**Then:** backend создаёт `PaymentAttempt` и возвращает checkout URL.

## AC-MVP2-PAY-002 - Успешная оплата обновляет счёт

**Given:** провайдер прислал валидный webhook успешной оплаты
**When:** backend обработал событие
**Then:** создан или обновлён `Payment`, а `Invoice.status` стал `PAID`.

## AC-MVP2-PAY-003 - Успешная оплата обновляет Subscription

**Given:** оплаченный счёт связан с `Subscription`
**When:** оплата подтверждена
**Then:** `Subscription.paymentStatus` становится `PAID`.

## AC-MVP2-PAY-004 - Failed payment не меняет оплату

**Given:** провайдер прислал failed payment
**When:** backend обработал событие
**Then:** счёт остаётся неоплаченным, а `Subscription.paymentStatus` не становится `PAID`.

## AC-MVP2-PAY-005 - Webhook идемпотентен

**Given:** провайдер прислал один и тот же webhook дважды
**When:** backend обработал оба запроса
**Then:** успешный платёж не продублирован.

## AC-MVP2-PAY-006 - Provider signature проверяется

**Given:** webhook пришёл с неверной подписью
**When:** backend получил запрос
**Then:** событие не применяется к платежам.

## AC-MVP2-ADMIN-001 - ADMIN видит платежи

**Given:** в системе есть платежи
**When:** ADMIN открывает раздел оплат
**Then:** он видит сумму, статус, родителя, ребёнка, счёт и provider id.

## AC-MVP2-ADMIN-002 - Ручная отметка требует комментарий

**Given:** ADMIN вручную отмечает счёт оплаченным
**When:** комментарий пустой
**Then:** система не сохраняет изменение.

## AC-MVP2-AUDIT-001 - Финансовые действия логируются

**Given:** счёт создан, оплачен, отменён или отмечен вручную
**When:** действие завершено
**Then:** создан `AuditLog` с actor, action, entity и old/new value.

## AC-MVP2-SEC-001 - Provider secrets не уходят на клиент

**Given:** родитель открывает оплату
**When:** frontend получает данные
**Then:** API не возвращает provider secret, webhook secret или private key.

---

## 18. Backlog-ready implementation plan

## MVP2-00 - Product and provider decision

**Цель:** принять минимальные решения перед кодом.

Scope:

- подтвердить, что MVP-2 стартует с mobile web, не с нативного приложения;
- выбрать платёжного провайдера;
- подтвердить юридический процесс оплаты с бухгалтером и провайдером;
- определить, нужен ли тестовый sandbox;
- определить, кто и как отправляет родителю invite link.

Exit criteria:

- выбран provider или зафиксирован provider adapter stub;
- понятны env vars;
- понятен процесс тестовой оплаты;
- нет открытого blocker по бухгалтерии.

## MVP2-01 - Data model

**Цель:** добавить модели родительского аккаунта, счёта и платежа.

Scope:

- `UserRole.PARENT`;
- `ParentAccount`;
- `ParentInvite`;
- `PasswordResetToken`;
- `Invoice`;
- `PaymentAttempt`;
- `Payment`;
- `PaymentWebhookEvent`;
- phone normalization helper for parent login;
- индексы и уникальные ограничения;
- миграции;
- seed/test fixtures.

Tests:

- parent account uniqueness;
- duplicate normalized parent phone is rejected;
- invoice cannot reference child of another parent;
- provider event id uniqueness.

## MVP2-02 - Parent auth and invite activation

**Цель:** родитель может активировать кабинет и войти.

Scope:

- admin action to create invite;
- activation page;
- password setup;
- phone-as-login flow;
- admin-assisted password reset link;
- parent login redirect;
- blocked parent cannot login;
- parent shell layout.

Tests:

- parent login uses normalized phone;
- parent sets password during invite activation;
- password reset token expires and is one-time;
- password reset invalidates active sessions;
- expired invite rejected;
- used invite rejected;
- invite rejected when parent phone is missing;
- invite rejected when normalized phone is already used;
- parent cannot access admin;
- admin/coach cannot access parent-only pages unless explicitly allowed for support mode later.

## MVP2-03 - Read-only parent cabinet

**Цель:** родитель видит детей, расписание, посещаемость и балансы.

Scope:

- `/parent`;
- `/parent/children/[id]`;
- parent child access guard;
- upcoming lessons query;
- attendance history query;
- balance summary query;
- subscription summary query;
- no internal comments in response.

Tests:

- parent cannot read another child;
- API response does not contain forbidden internal fields;
- multiple children are shown separately.

## MVP2-04 - Invoices in admin billing

**Цель:** админ может создавать и контролировать счета.

Scope:

- create invoice from subscription;
- list invoices;
- cancel invoice;
- mark invoice overdue job;
- parent sees issued invoice;
- audit log.

Tests:

- cannot pay cancelled invoice;
- overdue job updates status;
- paid invoice cannot be edited directly.

## MVP2-05 - Payment provider adapter

**Цель:** интегрировать выбранного платёжного провайдера через adapter.

Scope:

- env config;
- create checkout;
- provider redirect URL;
- webhook route;
- signature verification;
- sandbox support;
- provider errors mapped to internal statuses.

Tests:

- valid webhook accepted;
- invalid signature rejected;
- duplicate webhook ignored safely.

## MVP2-06 - Payment reconciliation

**Цель:** успешная оплата правильно обновляет домен.

Scope:

- create/update `Payment`;
- update `Invoice`;
- update `Subscription.paymentStatus`;
- recalculate `AdmissionStatus`;
- close or update related payment/admission tasks;
- admin view for failed/unmatched events.

Tests:

- success payment marks subscription paid;
- failed payment does not mark paid;
- partial payment creates `PARTIALLY_PAID`;
- admission recalculation runs after payment.

## MVP2-07 - Parent payment UX

**Цель:** родитель проходит оплату от кабинета до результата.

Scope:

- open invoice screen;
- pay button;
- redirect to provider;
- return success/pending/failure page;
- payment history;
- retry failed payment.

Tests:

- parent cannot start payment for another parent invoice;
- parent sees paid invoice after webhook;
- retry creates new attempt but does not duplicate invoice.

## MVP2-08 - Admin operations and support

**Цель:** админ может разбирать исключения.

Scope:

- failed payment list;
- manual mark paid;
- manual cancel invoice;
- webhook event diagnostics;
- reconcile action;
- task creation for unresolved payment events.

Tests:

- manual mark paid requires comment;
- manual action writes audit log;
- unresolved webhook creates admin-visible issue.

## MVP2-09 - Security, audit and regression hardening

**Цель:** закрыть риски внешнего кабинета.

Scope:

- RBAC tests;
- API data leakage tests;
- provider secret leak checks;
- audit coverage;
- Playwright parent happy path;
- Playwright cross-parent denial path.

Exit criteria:

- parent cannot access other parent data;
- no payment secrets in client bundle or API response;
- all financial mutations logged.

## MVP2-10 - Pilot rollout

**Цель:** включить MVP-2 для небольшой группы родителей.

Scope:

- выбрать 5-10 родителей;
- выдать invite;
- провести тестовую оплату;
- собрать ошибки;
- проверить админскую сверку;
- проверить спорные кейсы.

Metrics:

- сколько родителей активировали кабинет;
- сколько оплат прошло через кабинет;
- сколько платежей потребовало ручного вмешательства;
- сколько вопросов родитель всё равно написал админу.

---

## 19. Metrics MVP-2

Primary metrics:

```text
Activation rate parent accounts
Online payment share
Manual payment status changes
Payment questions to admin
Failed payment resolution time
Cross-parent data incidents
```

Целевые ориентиры для пилота:

- 80% приглашённых родителей активировали кабинет;
- 70% счетов пилотной группы оплачены через кабинет;
- ручные изменения `PaymentStatus` снизились минимум на 30%;
- 0 случаев доступа к чужим данным;
- спорные платежи видны админу в день возникновения.

---

## 20. Open decisions

Перед реализацией оплат нужно решить:

1. Какой платёжный провайдер используется первым?
2. Нужна ли поддержка СБП в первом релизе?
3. Кто отвечает за юридическую и бухгалтерскую проверку процесса?
4. Как родителю отправляется invite/reset link: вручную, VK, Telegram, SMS или email?
5. Нужна ли родителю квитанция/чек внутри кабинета или достаточно статуса оплаты?
6. Нужны ли частичные оплаты в обычном сценарии или только как админский exception?
7. Нужен ли второй родитель на одного ребёнка в MVP-2?
8. Нужно ли родителю подавать заявку на отпуск в MVP-2 или это отдельный MVP-2.1?
9. Показывать ли родителю медицинские ограничения или оставить это внутренним полем школы?
10. Какие тексты использовать для `NOT_ADMITTED`, чтобы быть честными, но не звучать агрессивно?

Рекомендуемые решения по умолчанию:

```text
Mobile web first.
Один ParentAccount на текущую Parent-card.
Логин родителя = нормализованный телефон.
Пароль родитель задаёт сам при активации.
Восстановление пароля в MVP-2 = одноразовая reset link, которую админ может отправить вручную.
Один счёт на одного ребёнка и один абонемент.
Invite link отправляется вручную через текущий канал.
Частичные оплаты - только exception.
Заявки на отпуск - после платежного happy path.
Провайдер выбирается отдельным решением перед MVP2-05.
```

---

## 21. Главные риски

| Риск | Вероятность | Влияние | Как снизить |
|---|---:|---:|---|
| Родитель увидит чужого ребёнка | Низкая | Критичное | Backend guards + cross-parent tests |
| Webhook продублирует оплату | Средняя | Высокое | Unique provider event id + idempotency |
| Failed payment ошибочно станет paid | Средняя | Высокое | Строгая status mapping + tests |
| Провайдер выбран слишком рано | Средняя | Среднее | Adapter interface + отдельное decision step |
| Оплата не сходится с абонементом | Средняя | Высокое | Invoice связан с Subscription, audit log |
| Родительский кабинет перегрузят функциями | Высокая | Среднее | Read-only cabinet first, requests later |
| Админ потеряет ручной контроль | Средняя | Среднее | Admin override с комментариями и audit |
| Юридические требования выяснятся поздно | Средняя | Высокое | Проверить с бухгалтером до MVP2-05 |

---

## 22. Итоговая формула MVP-2

```text
MVP-2 = Parent login + child read model + invoice + payment attempt + webhook-confirmed payment + admin reconciliation.
```

Не нужно начинать MVP-2 с бота, нативного приложения или сложных заявок.

Сначала родитель должен получить три вещи:

```text
Понять состояние ребёнка.
Понять, что нужно оплатить.
Оплатить без переписки.
```

Если это работает стабильно, следующими расширениями могут быть:

- заявки на отпуск;
- внешние уведомления;
- Telegram/VK bot;
- семейные счета;
- возвраты;
- редактирование профиля родителем;
- самостоятельная запись на перенос.
