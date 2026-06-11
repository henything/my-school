import type { AdmissionStatus } from "@/generated/prisma/enums";

export const DEFAULT_LESSON_PRICE_KOPEKS = 45000;

export function calculateSubscriptionTotal(plannedLessonsCount: number, lessonPriceKopeks = DEFAULT_LESSON_PRICE_KOPEKS) {
  return plannedLessonsCount * lessonPriceKopeks;
}

export function canUseCreditLesson(cachedLessonBalance: number, admissionStatus: AdmissionStatus) {
  return cachedLessonBalance === 0 && admissionStatus !== "NOT_ADMITTED";
}

export function admissionStatusAfterLessonBalance(cachedLessonBalance: number, currentStatus: AdmissionStatus): AdmissionStatus {
  if (cachedLessonBalance >= 0) {
    return "ADMITTED";
  }

  return currentStatus === "NOT_ADMITTED" ? "NOT_ADMITTED" : "CREDIT_LESSON_USED";
}
