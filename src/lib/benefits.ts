export const BENEFIT_CATEGORIES = ["LARGE_FAMILY", "MILITARY_FAMILY", "TWO_CHILDREN"] as const;
export type BenefitCategory = typeof BENEFIT_CATEGORIES[number];
export const BENEFIT_PERCENT = 10;
export const benefitLabels: Record<BenefitCategory, string> = {
  LARGE_FAMILY: "Многодетная семья",
  MILITARY_FAMILY: "Отец ребёнка — участник СВО",
  TWO_CHILDREN: "В нашей секции занимаются двое ваших детей"
};
export const benefitStatusLabels: Record<string, string> = { NONE: "Льгота не назначена", PENDING: "Ожидает подтверждения", APPROVED: "Льгота подтверждена", REJECTED: "Льгота не подтверждена" };
export function benefitLabel(category?: string | null) { return category && category in benefitLabels ? benefitLabels[category as BenefitCategory] : "Льгота"; }

export function discountedPrice(basePriceKopeks: number, percent: number) {
  if (!Number.isSafeInteger(basePriceKopeks) || basePriceKopeks < 0 || ![0, BENEFIT_PERCENT].includes(percent)) throw new Error("Некорректный расчёт скидки.");
  return Math.round(basePriceKopeks * (100 - percent) / 100);
}
