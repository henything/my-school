import { describe, expect, it } from "vitest";
import { calculateRecalculatedAmounts, countPlannedLessonsFromHistory, recalculationBlockReason } from "./recalculation";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("subscription recalculation", () => {
  it("excludes the trial, follows dated group membership and keeps a separately recorded paid visit", () => {
    const count = countPlannedLessonsFromHistory({
      lessons: [
        { id: "trial", groupId: "old", lessonDate: date("2026-10-06") },
        { id: "paid-1", groupId: "old", lessonDate: date("2026-10-08") },
        { id: "paid-2", groupId: "new", lessonDate: date("2026-10-13") },
        { id: "extra", groupId: "new", lessonDate: date("2026-10-15") }
      ],
      memberships: [
        { groupId: "old", startDate: date("2026-10-08"), endDate: date("2026-10-13") },
        { groupId: "new", startDate: date("2026-10-13"), endDate: null }
      ],
      attendancePlans: [{ effectiveFrom: date("2026-10-13"), weekday: 2 }],
      attendanceRecords: [{ lessonId: "extra", status: "PRESENT" }],
      trialLessonIds: new Set(["trial"])
    });
    expect(count).toBe(3);
  });

  it("preserves the unit price and applied makeup discount", () => {
    expect(calculateRecalculatedAmounts({
      previousLessonsCount: 8,
      previousTotalKopeks: 360000,
      nextLessonsCount: 7,
      appliedMakeupCount: 1
    })).toEqual({ nextTotalKopeks: 315000, nextInvoiceAmountKopeks: 270000 });
  });

  it("blocks automatic changes after payment or checkout starts", () => {
    const base = {
      hasInvoice: true,
      activeInvoicesCount: 1,
      invoiceStatus: "ISSUED",
      paidAmountKopeks: 0,
      paymentCount: 0,
      attemptCount: 0,
      nextLessonsCount: 4,
      nextInvoiceAmountKopeks: 180000,
      nextBalance: 2,
      unchanged: false
    };
    expect(recalculationBlockReason(base)).toBeNull();
    expect(recalculationBlockReason({ ...base, paidAmountKopeks: 5000 })).toContain("оплата");
    expect(recalculationBlockReason({ ...base, attemptCount: 1 })).toContain("начата оплата");
  });
});
