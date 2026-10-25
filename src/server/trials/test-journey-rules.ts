import { weekdayForDate } from "@/server/children/attendance-plan";

export type JourneyLesson = { lessonDate: Date; startTime: string };

export function paymentDeadline(signedAt: Date) {
  return new Date(signedAt.getTime() + 48 * 60 * 60 * 1000);
}

export function reservationDeadline(startedAt: Date, paymentDueAt?: Date | null) {
  const initial = new Date(startedAt.getTime() + 72 * 60 * 60 * 1000);
  return paymentDueAt && paymentDueAt > initial ? paymentDueAt : initial;
}

export function lessonStartsAt(lesson: JourneyLesson) {
  const day = lesson.lessonDate.toISOString().slice(0, 10);
  return new Date(`${day}T${lesson.startTime}:00+03:00`);
}

export function firstPaidLessonAfter<T extends JourneyLesson>(lessons: T[], dueAt: Date, weekday: number | null) {
  return lessons.find((lesson) =>
    lessonStartsAt(lesson) > dueAt &&
    (weekday === null || weekdayForDate(lesson.lessonDate) === weekday)
  ) ?? null;
}
