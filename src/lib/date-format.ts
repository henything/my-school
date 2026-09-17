const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
  timeZone: "Europe/Moscow"
});

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  const parts = dateTimeFormatter.formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")}/${part("month")}/${part("year")}, ${part("hour")}:${part("minute")}`;
}

export function formatTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

export function formatTimeRange(startTime: string | null | undefined, endTime: string | null | undefined) {
  return `${formatTime(startTime)}-${formatTime(endTime)}`;
}

export function formatLessonDateTime(lessonDate: string | Date, startTime: string, endTime?: string) {
  return endTime ? `${formatDate(lessonDate)}, ${formatTimeRange(startTime, endTime)}` : `${formatDate(lessonDate)}, ${formatTime(startTime)}`;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}
