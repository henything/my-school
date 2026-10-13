export type ExitAttendance = {
  lessonId: string;
  lessonDate: Date;
  status: string;
  isMakeup: boolean;
};

export function calculateExitPeriod(input: {
  periodStart: Date;
  periodEnd: Date;
  lessonPriceKopeks: number;
  attendance: ExitAttendance[];
  paidAmountKopeks: number;
  invoiceAmountKopeks: number;
}) {
  const records = input.attendance.filter((record) =>
    record.lessonDate >= input.periodStart && record.lessonDate <= input.periodEnd
  );
  const present = records.filter((record) => record.status === "PRESENT");
  const unexcusedAbsences = records.filter((record) => record.status === "ABSENT_UNEXCUSED");
  const sickAbsences = records.filter((record) => record.status === "ABSENT_SICK_PENDING");
  const chargedCount = records.filter((record) =>
    !record.isMakeup && (record.status === "PRESENT" || record.status === "ABSENT_UNEXCUSED")
  ).length;
  const earnedAmountKopeks = chargedCount * input.lessonPriceKopeks;
  const differenceKopeks = input.paidAmountKopeks - earnedAmountKopeks;

  return {
    presentDates: present.map((record) => record.lessonDate.toISOString().slice(0, 10)),
    unexcusedAbsenceDates: unexcusedAbsences.map((record) => record.lessonDate.toISOString().slice(0, 10)),
    sickAbsenceDates: sickAbsences.map((record) => record.lessonDate.toISOString().slice(0, 10)),
    makeupCount: records.filter((record) => record.isMakeup).length,
    chargedCount,
    earnedAmountKopeks,
    paidAmountKopeks: input.paidAmountKopeks,
    currentInvoiceAmountKopeks: input.invoiceAmountKopeks,
    potentialCreditKopeks: Math.max(0, differenceKopeks),
    potentialDebtKopeks: Math.max(0, -differenceKopeks),
    invoiceReductionKopeks: Math.max(0, input.invoiceAmountKopeks - earnedAmountKopeks)
  };
}
