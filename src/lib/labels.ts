const enumLabels: Record<string, string> = {
  SUPER_ADMIN: "Супер-админ",
  ADMIN: "Админ",
  COACH: "Тренер",
  PARENT: "Родитель",

  ACTIVE: "Активен",
  INACTIVE: "Неактивен",
  ARCHIVED: "Архив",
  INVITED: "Приглашён",
  BLOCKED: "Заблокирован",

  DRAFT: "Черновик",
  ISSUED: "Выставлен",
  PAYMENT_PENDING: "Ожидает оплаты",
  PARTIALLY_PAID: "Частично оплачен",
  PAID: "Оплачен",
  OVERDUE: "Просрочен",
  CANCELLED: "Отменён",

  CREATED: "Создан",
  REDIRECTED: "Переход к оплате",
  PENDING: "В ожидании",
  SUCCEEDED: "Успешно",
  FAILED: "Ошибка",
  EXPIRED: "Истёк",
  REFUNDED: "Возврат",

  PAUSED: "Пауза",
  LEFT: "Ушёл",
  TRIAL: "Пробный",
  ADMITTED: "Допущен",
  CREDIT_LESSON_USED: "Кредитное занятие",
  NOT_ADMITTED: "Недопуск",

  NOT_INVOICED: "Без счёта",
  INVOICED: "Счёт выставлен",
  NOT_PAID: "Не оплачен",

  SCHEDULED: "Запланировано",
  ATTENDANCE_PENDING: "Табель начат",
  ATTENDANCE_COMPLETED: "Табель заполнен",
  MOVED: "Перенесено",

  QUARANTINE: "Карантин",
  KINDERGARTEN_EVENT: "Мероприятие сада",
  RUSSIAN_HOLIDAY: "Праздник",
  COACH_UNAVAILABLE: "Тренер недоступен",
  GROUP_TRANSFER: "Перевод группы",
  OTHER: "Другое",

  NOT_MARKED: "Не отмечено",
  PRESENT: "Был",
  ABSENT_UNEXCUSED: "Пропуск без причины",
  ABSENT_SICK_PENDING: "Болезнь, ждём справку",
  ABSENT_SICK_CONFIRMED: "Болезнь подтверждена",
  ABSENT_VACATION_APPROVED: "Отпуск подтверждён",
  ABSENT_QUARANTINE: "Карантин",
  ABSENT_EVENT: "Мероприятие",
  ABSENT_UNEXCUSED_FINAL: "Неуважительный пропуск",

  SICKNESS: "Болезнь",
  VACATION: "Отпуск",
  AVAILABLE: "Доступен",
  ASSIGNED: "Назначен",
  USED: "Использован",

  MAKEUP_AND_CANCEL_LESSONS: "Отработки и отмена занятий",
  LESSON_BALANCE: "Занятия",
  MAKEUP_BALANCE: "Отработки",

  SUBSCRIPTION_CREATED: "Абонемент создан",
  PRESENT_DEDUCTION: "Списание за присутствие",
  UNEXCUSED_ABSENCE_DEDUCTION: "Списание за пропуск",
  SICKNESS_MAKEUP_CREATED: "Перенос по болезни",
  VACATION_MAKEUP_CREATED: "Перенос по отпуску",
  QUARANTINE_MAKEUP_CREATED: "Перенос по карантину",
  EVENT_MAKEUP_CREATED: "Перенос по событию",
  MAKEUP_USED: "Отработка использована",
  MANUAL_ADJUSTMENT: "Ручная корректировка",
  ATTENDANCE_DEDUCTION_REVERSAL: "Возврат списания",

  CRITICAL: "Критичный",
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",

  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  CLOSED: "Закрыта",

  ATTENDANCE_NOT_FILLED: "Не заполнен табель",
  CHILD_TOOK_CREDIT_LESSON: "Кредитное занятие",
  CHILD_NOT_ADMITTED: "Недопуск ребёнка",
  SICKNESS_FOLLOW_UP: "Проверить болезнь",
  CERTIFICATE_PENDING: "Ожидается справка",
  MAKEUP_NEEDS_ASSIGNMENT: "Назначить отработку",
  GROUP_OVER_CAPACITY: "Группа переполнена",
  TRIAL_NEEDS_PROCESSING: "Обработать пробник",
  ABSENCE_NEEDS_FINALIZATION: "Финализировать отсутствие",
  COACH_SUBSTITUTION_ASSIGNED: "Назначена замена",
  CHILD_WITHOUT_ACTIVE_SUBSCRIPTION: "Нет активного абонемента",
  MANUAL_TASK: "Ручная задача",

  TRIAL_BOOKED: "Пробник записан",
  TRIAL_ATTENDED: "Пробник пришёл",
  TRIAL_NO_SHOW: "Пробник не пришёл",
  CONTACT_COLLECTED: "Контакт получен",
  TRANSFERRED_TO_ADMIN: "Передан админу",
  CONVERTED_TO_ACTIVE: "Зачислен",

  VK: "VK",
  REFERRAL: "Рекомендация",
  KINDERGARTEN: "Детский сад",
  ADVERTISING: "Реклама",
  UNKNOWN: "Не указан",

  UPLOADED: "Загружен",
  VALIDATING: "Проверяется",
  VALIDATION_FAILED: "Ошибки проверки",
  READY_TO_IMPORT: "Готов к импорту",
  IMPORTED: "Импортирован",
  ERROR: "Ошибка",
  WARNING: "Предупреждение",

  READY: "Готово",
  NEEDS_ATTENTION: "Нужна проверка"
};

export function labelForEnum(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return enumLabels[value] ?? value;
}

export function labelsForSearch(...values: Array<string | null | undefined>) {
  return values.map((value) => [value, labelForEnum(value)].filter(Boolean).join(" ")).join(" ");
}
