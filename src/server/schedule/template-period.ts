import type { Prisma } from "@/generated/prisma/client";

export type TemplatePeriod = { validFrom?: Date | null; validUntil?: Date | null };

/** Template windows are calendar dates and use the half-open interval [from, until). */
export function isTemplateActiveOnDate(template: TemplatePeriod, date: Date) {
  const key = date.toISOString().slice(0, 10);
  return (!template.validFrom || template.validFrom.toISOString().slice(0, 10) <= key) &&
    (!template.validUntil || template.validUntil.toISOString().slice(0, 10) > key);
}

export function templatePeriodWhere(date: Date): Prisma.ScheduleTemplateWhereInput {
  const calendarDate = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return { AND: [
    { OR: [{ validFrom: null }, { validFrom: { lte: calendarDate } }] },
    { OR: [{ validUntil: null }, { validUntil: { gt: calendarDate } }] }
  ] };
}

export function templatesOnDate<T extends TemplatePeriod>(templates: T[], date: Date) {
  return templates.filter((template) => isTemplateActiveOnDate(template, date));
}

export function templateMatchesLesson(template: TemplatePeriod & { weekday: number; startTime?: string }, lesson: { lessonDate: Date; startTime: string }) {
  return isTemplateActiveOnDate(template, lesson.lessonDate) &&
    template.weekday === (lesson.lessonDate.getUTCDay() || 7) &&
    (template.startTime === undefined || template.startTime === lesson.startTime);
}

/** Until the invoice exists, the agreed first-paid schedule begins after the 48-hour payment window. */
export function signingScheduleReferenceDate(journey: { firstPaidLessonDate?: Date | null; paymentDueAt?: Date | null } | null, now = new Date()) {
  if (journey?.firstPaidLessonDate) return journey.firstPaidLessonDate;
  const anchor = journey?.paymentDueAt ?? new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(anchor);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`);
}
