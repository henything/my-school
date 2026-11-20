import { z } from "zod";
import { DEFAULT_LESSON_PRICE_KOPEKS } from "./calculations";

export const tariffMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Выберите месяц в формате ГГГГ-ММ.");
export const branchTariffInputSchema = z.object({
  effectiveMonth: tariffMonthSchema,
  lessonPriceKopeks: z.union([z.literal(45000), z.literal(37500)]),
  expectedVersion: z.number().int().nonnegative()
}).strict();
export type BranchTariffInput = z.infer<typeof branchTariffInputSchema>;
export class PricingConflict extends Error {}
export class TariffNotFound extends Error {}
export function monthDate(month: string) {
  return new Date(`${tariffMonthSchema.parse(month)}-01T00:00:00.000Z`);
}
export function priceForMonth<T extends { effectiveMonth: Date; lessonPriceKopeks: number }>(tariffs: T[], date: Date) {
  const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const tariff = tariffs.filter(t => t.effectiveMonth.getTime() <= month)
    .sort((a, b) => b.effectiveMonth.getTime() - a.effectiveMonth.getTime())[0] ?? null;
  return { tariff, lessonPriceKopeks: tariff?.lessonPriceKopeks ?? DEFAULT_LESSON_PRICE_KOPEKS };
}
