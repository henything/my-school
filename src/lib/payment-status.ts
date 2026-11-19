export const CALCULATED_PAYMENT_STATUS_MESSAGE = "Статус оплаты рассчитывается по платежам или зачётам";

export function isCalculatedPaymentStatus(status: string): boolean {
  return status === "PAID" || status === "PARTIALLY_PAID";
}
