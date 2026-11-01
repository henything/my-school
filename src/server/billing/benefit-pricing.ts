import { BENEFIT_PERCENT, discountedPrice, type BenefitCategory } from "@/lib/benefits";
import { calculateSubscriptionInvoiceAmount } from "./calculations";

type Snapshot = {
  plannedLessonsCount: number; lessonPriceKopeks: number; totalAmountKopeks: number;
  baseLessonPriceKopeks: number | null; baseTotalAmountKopeks: number | null;
  discountPercent: number; discountCategory: BenefitCategory | null;
};
/** Freeze the approved benefit when the first invoice is issued, never when an old bill is read. */
export function benefitPricing(subscription: Snapshot, parent: { benefitStatus: string; benefitCategory: BenefitCategory | null }, hasPreviousInvoice: boolean, makeups: number) {
  const baseLessonPriceKopeks = subscription.baseLessonPriceKopeks ?? subscription.lessonPriceKopeks;
  const baseTotalAmountKopeks = subscription.baseTotalAmountKopeks ?? subscription.totalAmountKopeks;
  const discountPercent = hasPreviousInvoice ? subscription.discountPercent : parent.benefitStatus === "APPROVED" && parent.benefitCategory ? BENEFIT_PERCENT : 0;
  const discountCategory = hasPreviousInvoice ? subscription.discountCategory : discountPercent ? parent.benefitCategory : null;
  const lessonPriceKopeks = hasPreviousInvoice ? subscription.lessonPriceKopeks : discountedPrice(baseLessonPriceKopeks, discountPercent);
  const totalAmountKopeks = hasPreviousInvoice ? subscription.totalAmountKopeks : discountedPrice(baseTotalAmountKopeks, discountPercent);
  const amountBeforeDiscountKopeks = calculateSubscriptionInvoiceAmount(baseTotalAmountKopeks, subscription.plannedLessonsCount, makeups);
  const amountKopeks = calculateSubscriptionInvoiceAmount(totalAmountKopeks, subscription.plannedLessonsCount, makeups);
  return { baseLessonPriceKopeks, baseTotalAmountKopeks, lessonPriceKopeks, totalAmountKopeks, discountPercent, discountCategory,
    amountBeforeDiscountKopeks, discountAmountKopeks: discountPercent ? Math.max(0, amountBeforeDiscountKopeks - amountKopeks) : 0, amountKopeks };
}
