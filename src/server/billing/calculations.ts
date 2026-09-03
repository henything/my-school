import type { AdmissionStatus } from "@/generated/prisma/enums";

export const DEFAULT_LESSON_PRICE_KOPEKS = 45000;

export function calculateBillableLessons(plannedLessonsCount: number, makeupCreditsToApply = 0) {
  return Math.max(plannedLessonsCount - Math.max(makeupCreditsToApply, 0), 0);
}

export function calculateSubscriptionTotal(
  plannedLessonsCount: number,
  lessonPriceKopeks = DEFAULT_LESSON_PRICE_KOPEKS,
  makeupCreditsToApply = 0
) {
  return calculateBillableLessons(plannedLessonsCount, makeupCreditsToApply) * lessonPriceKopeks;
}

export function calculateSubscriptionInvoiceAmount(
  totalAmountKopeks: number,
  plannedLessonsCount: number,
  makeupCreditsToApply = 0
) {
  if (plannedLessonsCount <= 0) {
    return 0;
  }

  const billableLessons = calculateBillableLessons(plannedLessonsCount, makeupCreditsToApply);
  return Math.round((totalAmountKopeks * billableLessons) / plannedLessonsCount);
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
