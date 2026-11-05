import { describe, expect, it } from "vitest";
import { summarizeDebt } from "./debt-summary";

describe("payment deadlines in analytics", () => {
  const today = new Date("2026-11-04T00:00:00Z");
  const bill = (parentId: string, due: string, amountKopeks = 45000, paidAmountKopeks = 0) =>
    ({ parentId, dueDate: new Date(`${due}T00:00:00Z`), amountKopeks, paidAmountKopeks });

  it("keeps today's and future bills waiting, and only earlier dates overdue", () => {
    expect(summarizeDebt([
      bill("a", "2026-11-03", 90000, 45000),
      bill("b", "2026-11-04"), bill("c", "2026-11-10")
    ], today)).toEqual({ waitingCount: 2, overdueCount: 1, waitingAmountKopeks: 90000, overdueAmountKopeks: 45000 });
  });

  it("deduplicates parents within each category, while keeping all outstanding money", () => {
    expect(summarizeDebt([
      bill("a", "2026-10-10"), bill("a", "2026-10-20"),
      bill("a", "2026-11-10"), bill("a", "2026-11-10"),
      bill("b", "2026-10-10", 45000, 45000), bill("c", "2026-10-10", 0)
    ], today)).toEqual({ waitingCount: 1, overdueCount: 1, waitingAmountKopeks: 90000, overdueAmountKopeks: 90000 });
  });
});
