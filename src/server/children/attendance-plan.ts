import { dateToKey } from "@/server/schedule/generation";

export type AttendancePlan = { effectiveFrom: Date; weekday: number | null };

export function todayInMoscow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
}

export function weekdayForDate(date: Date) {
  return date.getUTCDay() || 7;
}

export function weekdayForLesson(plans: AttendancePlan[], lessonDate: Date) {
  const lessonKey = dateToKey(lessonDate);
  const applicable = plans
    .filter((plan) => dateToKey(plan.effectiveFrom) <= lessonKey)
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0];
  return applicable?.weekday ?? null;
}

export function isLessonInChildPlan(plans: AttendancePlan[], lessonDate: Date) {
  const weekday = weekdayForLesson(plans, lessonDate);
  return weekday === null || weekdayForDate(lessonDate) === weekday;
}
