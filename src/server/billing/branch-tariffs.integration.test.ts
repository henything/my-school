import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { createSubscriptionSchema } from "./schemas";
import { createSubscription, ensureCurrentMonthSubscriptionForChild, ensureMonthlySubscriptionsForGroup, previewSubscription } from "./billing-service";
import { ensureEnrollmentSubscriptions } from "@/server/children/child-service";
import { listBranchTariffs, saveBranchTariff, saveBranchTariffInTransaction } from "./branch-tariff-service";
import * as attendancePlan from "@/server/children/attendance-plan";
import { createBranch } from "@/server/branches/branch-service";
import { deleteDirectory } from "@/server/directories/lifecycle-service";
import { monthDate, PricingConflict, TariffNotFound } from "./branch-tariff-rules";
import { getRecalculationPreview } from "./recalculation-service";

const year = new Date().getUTCFullYear() + 2;
const month = `${year}-01`;
const nextMonth = `${year}-02`;
const date = (day: number) => new Date(Date.UTC(year, 0, day));
describe.skipIf(!process.env.SBP_TEST_DATABASE_URL)("branch tariffs with PostgreSQL", () => {
  const db = getPrisma;
  let admin: CurrentUser;
  let coachId: string;
  beforeAll(async () => {
    const url = new URL(process.env.SBP_TEST_DATABASE_URL!);
    if (!url.pathname.startsWith("/azbuka_sbp_test_")) throw new Error("Use disposable database runner.");
    vi.stubEnv("DATABASE_URL", url.toString());
    vi.spyOn(attendancePlan, "todayInMoscow").mockReturnValue(date(0));
    const school = await db().school.create({ data: { name: "Тест тарифов", slug: randomUUID() } });
    const user = await db().user.create({ data: { schoolId: school.id, login: randomUUID(), passwordHash: "unused", displayName: "Администратор тарифов", role: "ADMIN" } });
    admin = { id: user.id, schoolId: school.id, login: user.login, displayName: user.displayName, role: user.role };
    coachId = (await db().coachProfile.create({ data: { schoolId: school.id, userId: user.id } })).id;
  });
  afterAll(async () => { await db().$disconnect(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  async function fixture(count = 3) {
    const branch = await db().branch.create({ data: { schoolId: admin.schoolId, name: randomUUID() } });
    const group = await db().trainingGroup.create({ data: { schoolId: admin.schoolId, branchId: branch.id, name: randomUUID(), mainCoachId: coachId } });
    const parent = await db().parent.create({ data: { schoolId: admin.schoolId, fullName: "Родитель", phone: "+79990000001" } });
    const child = await db().child.create({ data: { schoolId: admin.schoolId, parentId: parent.id, currentGroupId: group.id, fullName: randomUUID() } });
    await db().childGroupMembership.create({ data: { childId: child.id, groupId: group.id, startDate: date(1) } });
    const lessons = [];
    for (let i = 1; i <= count; i++) lessons.push(await db().lesson.create({ data: { schoolId: admin.schoolId, groupId: group.id, branchId: branch.id, coachId, lessonDate: date(i), startTime: "16:00", endTime: "17:00" } }));
    return { branch, group, parent, child, lessons };
  }
  const inputFor = (childId: string, extra: Record<string, unknown> = {}) => createSubscriptionSchema.parse({ childId, periodStart: `${month}-01`, periodEnd: `${month}-31`, pricingMode: "BRANCH_TARIFF", ...extra });
  const rate = (branchId: string, price: 37500 | 45000 = 37500, expectedVersion = 0, effectiveMonth?: string) => effectiveMonth
    ? db().$transaction(tx => saveBranchTariffInTransaction(tx, admin, branchId, { lessonPriceKopeks: price, expectedVersion }, effectiveMonth))
    : saveBranchTariff(admin, branchId, { expectedEffectiveMonth: month, lessonPriceKopeks: price, expectedVersion });
  async function createReviewed(childId: string, extra: Record<string, unknown> = {}) {
    const input = inputFor(childId, extra);
    const preview = await previewSubscription(admin, input);
    return createSubscription(admin, { ...input, pricingToken: preview.pricingToken }, true);
  }

  it.each([3, 8, 9])("creates reviewed %i-lesson subscription with the selected tariff and immutable snapshot", async count => {
    const f = await fixture(count);
    await rate(f.branch.id);
    const result = await createReviewed(f.child.id);
    expect(result).toMatchObject({ plannedLessonsCount: count, baseLessonPriceKopeks: 37500, baseTotalAmountKopeks: count * 37500, pricingSource: "BRANCH_TARIFF", branchTariffVersion: 1 });
    const invoice = await db().invoice.findFirstOrThrow({ where: { subscriptionId: result.id } });
    expect(invoice.amountKopeks).toBe(count * 37500);
    const before = await db().subscription.findUniqueOrThrow({ where: { id: result.id } });
    await rate(f.branch.id, 45000, 1);
    expect(await db().subscription.findUniqueOrThrow({ where: { id: result.id } })).toEqual(before);
    expect(await db().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(invoice);
    const history = await listBranchTariffs(admin, f.branch.id);
    expect(history.changes).toHaveLength(2);
    expect(history.changes[0].author).toBe(admin.displayName);
  });
  it("uses the target month, defaults other branches and never inherits last month's manual price", async () => {
    const f = await fixture();
    await rate(f.branch.id, 37500, 0, nextMonth);
    await createSubscription(admin, createSubscriptionSchema.parse({ childId: f.child.id, periodStart: `${year - 1}-12-01`, periodEnd: `${year - 1}-12-31`, plannedLessonsCount: 2, lessonPriceKopeks: 12300 }));
    const result = await db().$transaction(tx => ensureCurrentMonthSubscriptionForChild(tx, admin, f.child.id, date(1)));
    expect(result).toMatchObject({ lessonPriceKopeks: 45000, pricingSource: "DEFAULT" });
    const other = await fixture();
    expect((await createReviewed(other.child.id)).lessonPriceKopeks).toBe(45000);
    expect((await listBranchTariffs(admin, f.branch.id)).lessonPriceKopeks).toBe(45000);
  });
  it("schedules edits for next month while new branches start at their selected price", async () => {
    const branch = await createBranch(admin, { name: randomUUID(), lessonPriceKopeks: 37500 });
    const initial = await listBranchTariffs(admin, branch.id);
    expect(initial).toMatchObject({ currentLessonPriceKopeks: 37500, lessonPriceKopeks: 37500, effectiveMonth: month, expectedVersion: 0 });
    await rate(branch.id, 45000);
    expect(await listBranchTariffs(admin, branch.id)).toMatchObject({ currentLessonPriceKopeks: 37500, lessonPriceKopeks: 45000, expectedVersion: 1 });
    const current = await db().branchTariff.findMany({ where: { branchId: branch.id }, orderBy: { effectiveMonth: "asc" } });
    expect(current.map(t => [t.effectiveMonth.toISOString().slice(0, 7), t.lessonPriceKopeks])).toEqual([[`${year - 1}-12`, 37500], [month, 45000]]);
    await rate(branch.id, 37500, 1);
    expect(await listBranchTariffs(admin, branch.id)).toMatchObject({ currentLessonPriceKopeks: 37500, lessonPriceKopeks: 37500, expectedVersion: 2 });
    const standard = await createBranch(admin, { name: randomUUID() });
    expect((await listBranchTariffs(admin, standard.id)).currentLessonPriceKopeks).toBe(45000);
    await deleteDirectory(admin, "branches", standard.id);
    expect(await db().branch.findUnique({ where: { id: standard.id } })).toBeNull();
  });
  it("applies the tariff during enrollment and automatic monthly generation, idempotently", async () => {
    const f = await fixture();
    await rate(f.branch.id);
    await db().$transaction(tx => ensureEnrollmentSubscriptions(tx, admin, f.child.id, date(1)));
    expect(await db().subscription.findFirstOrThrow({ where: { childId: f.child.id } })).toMatchObject({ baseLessonPriceKopeks: 37500 });
    const other = await fixture(); await rate(other.branch.id);
    const first = await ensureMonthlySubscriptionsForGroup(admin, month, other.group.id);
    expect(first).toMatchObject({ createdCount: 1, issues: [] });
    const repeat = await ensureMonthlySubscriptionsForGroup(admin, month, other.group.id);
    expect(repeat).toMatchObject({ createdCount: 0, existingCount: 1, issues: [] });
    expect(await db().subscription.count({ where: { childId: other.child.id } })).toBe(1);
  });
  it.each([37500, 45000] as const)("rejects a default-price preview after the first tariff %i is created without any writes", async price => {
    const f = await fixture(); const input = inputFor(f.child.id);
    const preview = await previewSubscription(admin, input);
    await rate(f.branch.id, price);
    await expect(createSubscription(admin, { ...input, pricingToken: preview.pricingToken }, true)).rejects.toBeInstanceOf(PricingConflict);
    expect(await db().subscription.count({ where: { childId: f.child.id } })).toBe(0);
    expect(await db().invoice.count({ where: { childId: f.child.id } })).toBe(0);
    expect((await db().child.findUniqueOrThrow({ where: { id: f.child.id } })).cachedLessonBalance).toBe(0);
    expect(await createReviewed(f.child.id)).toMatchObject({ baseLessonPriceKopeks: price });
  });
  it("rejects an edited tariff preview and concurrent stale tariff writers", async () => {
    const f = await fixture(); await rate(f.branch.id);
    const input = inputFor(f.child.id); const preview = await previewSubscription(admin, input);
    const writes = await Promise.allSettled([rate(f.branch.id, 45000, 1), rate(f.branch.id, 37500, 1)]);
    expect(writes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter(r => r.status === "rejected")).toHaveLength(1);
    await expect(createSubscription(admin, { ...input, pricingToken: preview.pricingToken }, true)).rejects.toBeInstanceOf(PricingConflict);
  });
  it("applies benefits once, keeps kopeks, and snapshots makeup credit changes", async () => {
    const f = await fixture(3); await rate(f.branch.id);
    await db().parent.update({ where: { id: f.parent.id }, data: { benefitStatus: "APPROVED", benefitCategory: "LARGE_FAMILY" } });
    const input = inputFor(f.child.id); const preview = await previewSubscription(admin, input);
    expect(preview).toMatchObject({ baseTotalAmountKopeks: 112500, invoiceAmountKopeks: 101250, discountPercent: 10 });
    await db().makeupCredit.create({ data: { schoolId: admin.schoolId, childId: f.child.id, groupId: f.group.id, reason: "SICKNESS", createdAt: date(0) } });
    await expect(createSubscription(admin, { ...input, pricingToken: preview.pricingToken }, true)).rejects.toBeInstanceOf(PricingConflict);
    const updated = await previewSubscription(admin, input);
    expect(updated).toMatchObject({ appliedMakeupCount: 1, invoiceAmountKopeks: 67500 });
    const result = await createSubscription(admin, { ...input, pricingToken: updated.pricingToken }, true);
    const invoice = await db().invoice.findFirstOrThrow({ where: { subscriptionId: result.id } });
    expect(invoice.amountKopeks).toBe(updated.invoiceAmountKopeks);
  });
  it("keeps existing issued, paid, partial and pending invoices byte-for-byte when a tariff changes", async () => {
    const f = await fixture();
    const created = await createReviewed(f.child.id);
    const invoice = await db().invoice.findFirstOrThrow({ where: { subscriptionId: created.id } });
    let version = 0;
    for (const status of ["ISSUED", "PAID", "PARTIALLY_PAID", "PAYMENT_PENDING"] as const) {
      await db().invoice.update({ where: { id: invoice.id }, data: { status, paidAmountKopeks: status === "PAID" ? 135000 : status === "PARTIALLY_PAID" ? 100 : 0 } });
      const before = await db().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      await rate(f.branch.id, version % 2 ? 45000 : 37500, version++);
      expect(await db().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(before);
      expect((await db().subscription.findUniqueOrThrow({ where: { id: created.id } })).baseLessonPriceKopeks).toBe(45000);
    }
  });
  it("uses the stored price during recalculation after a tariff change", async () => {
    const f = await fixture(); await rate(f.branch.id); const sub = await createReviewed(f.child.id);
    await rate(f.branch.id, 45000, 1);
    await db().lesson.update({ where: { id: f.lessons[0].id }, data: { status: "CANCELLED" } });
    const preview = await getRecalculationPreview(admin, sub.id);
    expect(preview).toMatchObject({ nextLessonsCount: 2, nextTotalKopeks: 75000 });
  });
  it("uses the selected weekday and excludes cancelled and quarantine lessons at the garden price", async () => {
    const f = await fixture(9); await rate(f.branch.id);
    const weekday = date(1).getUTCDay() || 7;
    await db().childAttendancePlan.create({ data: { childId: f.child.id, effectiveFrom: date(1), weekday } });
    expect((await previewSubscription(admin, inputFor(f.child.id))).plannedLessonsCount).toBe(2);
    await db().lesson.update({ where: { id: f.lessons[0].id }, data: { status: "CANCELLED" } });
    const input = inputFor(f.child.id, { periodStart: `${month}-02` });
    expect(await previewSubscription(admin, input)).toMatchObject({ plannedLessonsCount: 1, baseTotalAmountKopeks: 37500 });
    await db().attendanceRecord.create({ data: { childId: f.child.id, lessonId: f.lessons[7].id, status: "ABSENT_QUARANTINE" } });
    await expect(previewSubscription(admin, input)).rejects.toThrow("хотя бы одно");
  });
  it("applies monetary credits to the reviewed amount once and invalidates a changed credit", async () => {
    const f = await fixture(); await rate(f.branch.id);
    const old = await createSubscription(admin, createSubscriptionSchema.parse({ childId: f.child.id, periodStart: `${year - 1}-12-01`, periodEnd: `${year - 1}-12-31`, plannedLessonsCount: 2, lessonPriceKopeks: 45000 }));
    const credit = await db().billingAdjustment.create({ data: { schoolId: admin.schoolId, parentId: f.parent.id, childId: f.child.id, sourceSubscriptionId: old.id, kind: "CREDIT", amountKopeks: 20000, reason: "Переплата", createdByUserId: admin.id } });
    const input = inputFor(f.child.id); const first = await previewSubscription(admin, input);
    expect(first).toMatchObject({ creditAmountKopeks: 20000, invoiceAmountKopeks: 92500 });
    await db().billingAdjustment.update({ where: { id: credit.id }, data: { amountKopeks: 25000 } });
    await expect(createSubscription(admin, { ...input, pricingToken: first.pricingToken }, true)).rejects.toBeInstanceOf(PricingConflict);
    const reviewed = await previewSubscription(admin, input);
    const sub = await createSubscription(admin, { ...input, pricingToken: reviewed.pricingToken }, true);
    expect((await db().invoice.findFirstOrThrow({ where: { subscriptionId: sub.id } })).amountKopeks).toBe(87500);
    expect((await db().billingAdjustment.findUniqueOrThrow({ where: { id: credit.id } })).appliedAmountKopeks).toBe(25000);
  });
  it("audits explicit manual amounts, preserves legacy price requests, and rejects unsafe periods and counts", async () => {
    const f = await fixture(); await rate(f.branch.id);
    const result = await createReviewed(f.child.id, { pricingMode: "MANUAL", totalAmountRub: 1500, manualReason: "Особые условия" });
    expect(result).toMatchObject({ pricingSource: "MANUAL", baseTotalAmountKopeks: 150000, branchTariffId: null });
    expect((await db().auditLog.findFirstOrThrow({ where: { entityId: result.id, action: "SUBSCRIPTION_CREATED" } })).newValue).toMatchObject({ manualReason: "Особые условия" });
    const other = await fixture();
    const legacy = await createSubscription(admin, createSubscriptionSchema.parse({ childId: other.child.id, periodStart: `${month}-01`, periodEnd: `${month}-31`, lessonPriceKopeks: 42000 }));
    expect(legacy).toMatchObject({ pricingSource: "MANUAL", baseTotalAmountKopeks: 126000 });
    const third = await fixture();
    await expect(previewSubscription(admin, inputFor(third.child.id, { periodEnd: `${nextMonth}-01` }))).rejects.toThrow("одного календарного месяца");
    await expect(previewSubscription(admin, inputFor(third.child.id, { plannedLessonsCount: 8 }))).rejects.toThrow("Количество занятий");
  });
  it("reports mixed branches, continues the batch, and uses the destination for a later month", async () => {
    const mixed = await fixture(); const destination = await fixture(); await rate(destination.branch.id);
    await db().childGroupMembership.updateMany({ where: { childId: mixed.child.id }, data: { endDate: date(3) } });
    await db().childGroupMembership.create({ data: { childId: mixed.child.id, groupId: destination.group.id, startDate: date(3) } });
    await db().child.update({ where: { id: mixed.child.id }, data: { currentGroupId: destination.group.id } });
    const good = await fixture();
    const batch = await ensureMonthlySubscriptionsForGroup(admin, month, null, [mixed.child.id, good.child.id]);
    expect(batch.createdCount).toBe(1);
    expect(batch.issues).toHaveLength(1);
    expect(batch.issues[0].reason).toContain("разных филиалов");
    expect(await db().task.count({ where: { childId: mixed.child.id, type: "BILLING_RECONCILIATION_REQUIRED" } })).toBe(1);
    await db().lesson.create({ data: { schoolId: admin.schoolId, groupId: destination.group.id, branchId: destination.branch.id, coachId, lessonDate: monthDate(nextMonth), startTime: "16:00", endTime: "17:00" } });
    const next = await db().$transaction(tx => ensureCurrentMonthSubscriptionForChild(tx, admin, mixed.child.id, monthDate(nextMonth)));
    expect(next).toMatchObject({ pricingBranchId: destination.branch.id, baseLessonPriceKopeks: 37500 });
  });
  it("rejects foreign schools, unauthorized roles, archived branches and a stale effective month", async () => {
    const f = await fixture();
    const stranger = await db().school.create({ data: { name: "Чужая школа", slug: randomUUID() } });
    await expect(saveBranchTariff({ ...admin, schoolId: stranger.id }, f.branch.id, { expectedEffectiveMonth: month, lessonPriceKopeks: 37500, expectedVersion: 0 })).rejects.toBeInstanceOf(TariffNotFound);
    for (const role of ["COACH", "PARENT"] as const) {
      await expect(saveBranchTariff({ ...admin, role }, f.branch.id, { expectedEffectiveMonth: month, lessonPriceKopeks: 37500, expectedVersion: 0 })).rejects.toThrow("Недостаточно прав");
      await expect(previewSubscription({ ...admin, role }, inputFor(f.child.id))).rejects.toThrow();
    }
    await expect(saveBranchTariff(admin, f.branch.id, { expectedEffectiveMonth: "2000-01", lessonPriceKopeks: 37500, expectedVersion: 0 })).rejects.toBeInstanceOf(PricingConflict);
    await db().branch.update({ where: { id: f.branch.id }, data: { status: "ARCHIVED" } });
    await expect(rate(f.branch.id)).rejects.toThrow("активного филиала");
    expect(await db().branchTariff.count({ where: { branchId: f.branch.id } })).toBe(0);
  });
});
