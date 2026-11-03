import { BENEFIT_PERCENT, discountedPrice, type BenefitCategory } from "@/lib/benefits";
import { calculateSubscriptionInvoiceAmount } from "./calculations";

type Snapshot = {
  plannedLessonsCount: number; lessonPriceKopeks: number; totalAmountKopeks: number;
  baseLessonPriceKopeks: number | null; baseTotalAmountKopeks: number | null;
  discountPercent: number; discountCategory: BenefitCategory | null;
};
type BenefitParent = {
  benefitStatus: string; benefitCategory: BenefitCategory | null;
  benefitEvidenceSubmittedAt?: Date | null; benefitFirstInvoiceMonth?: Date | null;
  benefitProvisionalCategory?: BenefitCategory | null;
};

export function benefitMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Freeze the invoice price; a provisional claim covers only its anchored calendar month. */
export function benefitPricing(subscription: Snapshot, parent: BenefitParent, hasPreviousInvoice: boolean, makeups: number, periodStart?: Date) {
  const baseLessonPriceKopeks = subscription.baseLessonPriceKopeks ?? subscription.lessonPriceKopeks;
  const baseTotalAmountKopeks = subscription.baseTotalAmountKopeks ?? subscription.totalAmountKopeks;
  const provisional = Boolean(parent.benefitEvidenceSubmittedAt && parent.benefitProvisionalCategory && periodStart && parent.benefitFirstInvoiceMonth &&
    benefitMonth(periodStart).getTime() === benefitMonth(parent.benefitFirstInvoiceMonth).getTime());
  const category = parent.benefitStatus === "APPROVED" && parent.benefitCategory ? parent.benefitCategory : provisional ? parent.benefitProvisionalCategory : null;
  const discountPercent = hasPreviousInvoice ? subscription.discountPercent : category ? BENEFIT_PERCENT : 0;
  const discountCategory = hasPreviousInvoice ? subscription.discountCategory : category ?? null;
  const lessonPriceKopeks = hasPreviousInvoice ? subscription.lessonPriceKopeks : discountedPrice(baseLessonPriceKopeks, discountPercent);
  const totalAmountKopeks = hasPreviousInvoice ? subscription.totalAmountKopeks : discountedPrice(baseTotalAmountKopeks, discountPercent);
  const amountBeforeDiscountKopeks = calculateSubscriptionInvoiceAmount(baseTotalAmountKopeks, subscription.plannedLessonsCount, makeups);
  const amountKopeks = calculateSubscriptionInvoiceAmount(totalAmountKopeks, subscription.plannedLessonsCount, makeups);
  return { baseLessonPriceKopeks, baseTotalAmountKopeks, lessonPriceKopeks, totalAmountKopeks, discountPercent, discountCategory,
    amountBeforeDiscountKopeks, discountAmountKopeks: discountPercent ? Math.max(0, amountBeforeDiscountKopeks - amountKopeks) : 0, amountKopeks };
}
