/** Integration regression scenarios. Run ONLY against a disposable localhost database containing schedule_pipeline_qa in its name. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../src/server/db/prisma";
import { hashPassword } from "../src/server/auth/password";
import { changeGroupSchedule } from "../src/server/schedule/change-service";
import { scheduleChangeSchema } from "../src/server/schedule/change-schema";
import { buildLessonCandidates } from "../src/server/schedule/generation";
import { ensureCurrentMonthSubscriptionForChild, ensureMonthlySubscriptionsForGroup } from "../src/server/billing/billing-service";
import { generateLessonsForAcademicYear, generateLessonsForMonth } from "../src/server/schedule/lesson-service";
import { resolveBillingSickness, syncBillingControlTasks } from "../src/server/billing/control-service";
const url = new URL(process.env.DATABASE_URL ?? "");
assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.includes("schedule_pipeline_qa"), "Disposable LOCAL QA database required");
const p = getPrisma();
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const run = randomUUID().slice(0, 8);
const school = await p.school.create({ data: { name: `QA расписания ${run}`, slug: `schedule-qa-${run}` } });
const admin = await p.user.create({ data: { schoolId: school.id, role: "SUPER_ADMIN", login: `schedule-qa-${run}`, displayName: "Администратор QA", passwordHash: await hashPassword("Schedule-QA-2026!") } });
const coachUser = await p.user.create({ data: { schoolId: school.id, role: "COACH", login: "schedule-qa-coach", displayName: "Тренер QA", passwordHash: "not-a-login-hash" } });
const coach = await p.coachProfile.create({ data: { schoolId: school.id, userId: coachUser.id } });
const branch = await p.branch.create({ data: { schoolId: school.id, name: "Тестовый филиал расписаний" } });
const slots = [{ weekday: 2, startTime: "10:00", endTime: "11:00" }, { weekday: 4, startTime: "10:00", endTime: "11:00" }];

async function fixture(name: string, options: { weekdays?: number[]; fixedDay?: number; credit?: number; paid?: boolean; protected?: boolean } = {}) {
  const group = await p.trainingGroup.create({ data: { schoolId: school.id, branchId: branch.id, mainCoachId: coach.id, name } });
  const parent = await p.parent.create({ data: { schoolId: school.id, fullName: `Родитель ${name}` } });
  const child = await p.child.create({ data: { schoolId: school.id, parentId: parent.id, currentGroupId: group.id, fullName: `Ребёнок ${name}` } });
  await p.childGroupMembership.create({ data: { childId: child.id, groupId: group.id, startDate: date("2026-11-01") } });
  if (options.fixedDay) await p.childAttendancePlan.create({ data: { childId: child.id, effectiveFrom: date("2026-11-01"), weekday: options.fixedDay } });
  const templates = [];
  for (const weekday of options.weekdays ?? [1, 3]) templates.push(await p.scheduleTemplate.create({ data: { schoolId: school.id,
    groupId: group.id, branchId: branch.id, coachId: coach.id, weekday, startTime: "10:00", endTime: "11:00" } }));
  await p.lesson.createMany({ data: buildLessonCandidates(templates, "2026-11").map(l => ({ schoolId: school.id, ...l })) });
  await p.$transaction(tx => ensureCurrentMonthSubscriptionForChild(tx, admin, child.id, date("2026-11-01")), { timeout: 30000 });
  const subscription = await p.subscription.findFirstOrThrow({ where: { childId: child.id } });
  const invoice = await p.invoice.findFirstOrThrow({ where: { childId: child.id } });
  if (options.credit) {
    const credit = await p.billingAdjustment.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id,
      kind: "CREDIT", amountKopeks: options.credit, appliedAmountKopeks: options.credit, reason: "QA ранее применённый зачёт", createdByUserId: admin.id } });
    await p.billingAdjustmentApplication.create({ data: { invoiceId: invoice.id, adjustmentId: credit.id, amountKopeks: options.credit } });
    await p.invoice.update({ where: { id: invoice.id }, data: { amountKopeks: Math.max(0, invoice.amountKopeks - options.credit) } });
  }
  if (options.paid) {
    const fresh = await p.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await p.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAmountKopeks: fresh.amountKopeks, paidAt: new Date() } });
    await p.subscription.update({ where: { id: subscription.id }, data: { paymentStatus: "PAID" } });
    if (fresh.amountKopeks) await p.payment.create({ data: { schoolId: school.id, parentId: parent.id, childId: child.id,
      subscriptionId: subscription.id, invoiceId: invoice.id, amountKopeks: fresh.amountKopeks, provider: "MANUAL_QA", status: "SUCCEEDED", paidAt: new Date() } });
  }
  if (options.protected) {
    const lesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id }, orderBy: { lessonDate: "asc" } });
    await p.attendanceRecord.create({ data: { lessonId: lesson.id, childId: child.id, status: "PRESENT", markedByUserId: coachUser.id } });
  }
  const input = scheduleChangeSchema.parse({ groupId: group.id, effectiveFrom: "2026-11-01", slots, reason: "QA изменение расписания" });
  async function preview(plans = input.plans) { return changeGroupSchedule(admin, { ...input, plans }); }
  async function apply(plans = input.plans, acknowledgeManualTasks = false) {
    const result = await preview(plans);
    return changeGroupSchedule(admin, { ...input, plans, action: "apply", fingerprint: result.fingerprint, acknowledgeManualTasks });
  }
  return { group, child, subscription, invoice, input, preview, apply };
}

try {
  const basic = await fixture("01 Смена дней", { fixedDay: 3 });
  const blocked = await basic.preview();
  assert.equal(blocked.planChoices.length, 1); assert(blocked.blockers.length);
  assert.equal(await p.scheduleTemplate.count({ where: { groupId: basic.group.id } }), 2);
  const plans = [{ childId: basic.child.id, effectiveFrom: "2026-11-01", weekday: null }];
  const proposed = await basic.preview(plans);
  assert.equal(proposed.cancelled.length, 9);
  assert.equal(proposed.bills[0].afterLessons, 8);
  assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: basic.invoice.id } })).amountKopeks, 180000, "Preview must roll back");
  await p.child.update({ where: { id: basic.child.id }, data: { adminComment: "Changed after preview" } });
  await assert.rejects(changeGroupSchedule(admin, { ...basic.input, plans, action: "apply", fingerprint: proposed.fingerprint }), /изменились/);
  const result = await basic.apply(plans);
  assert(result.applied);
  assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: basic.invoice.id } })).amountKopeks, 360000);
  await generateLessonsForAcademicYear(admin, { academicYearStart: 2026, groupId: basic.group.id });
  await generateLessonsForMonth(admin, { month: "2026-11", groupId: basic.group.id });
  assert.equal(await p.lesson.count({ where: { groupId: basic.group.id, lessonDate: { gte: date("2026-11-01"), lte: date("2026-11-30") }, status: { not: "CANCELLED" } } }), 8);
  await assert.rejects(changeGroupSchedule({ ...admin, role: "COACH" }, basic.input));
  await assert.rejects(changeGroupSchedule({ ...admin, schoolId: randomUUID() }, basic.input));
  console.log("PASS: required child day, preview rollback, stale preview, 8 not17, repeated generation, permissions");

  const credit = await fixture("02 Зачёт", { credit: 45000 });
  const cp = await credit.preview(); assert.equal(cp.bills[0].afterKopeks, 315000);
  await credit.apply();
  assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: credit.invoice.id } })).amountKopeks, 315000);
  assert.equal(await p.billingAdjustmentApplication.count({ where: { invoiceId: credit.invoice.id } }), 1);
  console.log("PASS: applied 450 rubles credit preserved");

  const paid = await fixture("03 Оплаченный", { paid: true });
  const before = await p.invoice.findUniqueOrThrow({ where: { id: paid.invoice.id } });
  await paid.apply();
  assert.deepEqual(await p.invoice.findUniqueOrThrow({ where: { id: paid.invoice.id } }), before);
  assert.equal((await p.billingAdjustment.findFirstOrThrow({ where: { sourceInvoiceId: paid.invoice.id } })).amountKopeks, 45000);
  await paid.apply();
  assert.equal(await p.billingAdjustment.count({ where: { sourceInvoiceId: paid.invoice.id } }), 1);
  console.log("PASS: paid decrease preserves original invoice/payment, single credit on repeat");

  const increased = await fixture("04 Подорожание", { weekdays: [3], paid: true });
  const inc = await increased.preview(); assert.equal(inc.manualTaskCount, 1);
  await assert.rejects(increased.apply(), /Подтвердите/);
  assert.equal(await p.scheduleTemplate.count({ where: { groupId: increased.group.id } }), 1, "Rejected apply must roll back");
  await increased.apply([], true);
  assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: increased.invoice.id } })).amountKopeks, 180000);
  assert.equal(await p.task.count({ where: { groupId: increased.group.id, relatedEntityType: "ScheduleChange", status: "OPEN" } }), 1);
  console.log("PASS: paid increase requires explicit acknowledgment and task, no additional charge");

  const attendance = await fixture("05 История", { protected: true });
  const hp = await attendance.preview(); assert.equal(hp.preserved.length, 1); assert.equal(hp.bills[0].afterLessons, 9);
  await attendance.apply();
  assert.equal(await p.attendanceRecord.count({ where: { childId: attendance.child.id, status: "PRESENT" } }), 1);
  console.log("PASS: historical attendance preserved and explicitly included in bill preview");

  const future = await fixture("06 Будущая дата");
  const fi = { ...future.input, effectiveFrom: "2026-11-16" };
  const fp = await changeGroupSchedule(admin, fi);
  assert.equal(fp.cancelled.length, 5); assert.equal(fp.bills[0].afterLessons, 8);
  await changeGroupSchedule(admin, { ...fi, action: "apply", fingerprint: fp.fingerprint });
  assert.equal(await p.lesson.count({ where: { groupId: future.group.id, lessonDate: { lt: date("2026-11-16") }, status: { not: "CANCELLED" } } }), 4);
  console.log("PASS: future-dated change keeps earlier lessons");

  const stale = await fixture("07 Проверка прошлого в preview");
  const staleInput = { ...stale.input, effectiveFrom: "2026-11-16" };
  const stalePreview = await changeGroupSchedule(admin, staleInput);
  const earlier = await p.lesson.findFirstOrThrow({ where: { groupId: stale.group.id }, orderBy: { lessonDate: "asc" } });
  await p.lesson.update({ where: { id: earlier.id }, data: { status: "CANCELLED" } });
  await assert.rejects(changeGroupSchedule(admin, { ...staleInput, action: "apply", fingerprint: stalePreview.fingerprint }), /изменились/);
  console.log("PASS: a changed earlier lesson invalidates a full-month financial preview");

  const concurrent = await fixture("09 Одновременное подтверждение");
  const concurrentPreview = await concurrent.preview();
  const attempts = await Promise.allSettled([1, 2].map(() => changeGroupSchedule(admin, { ...concurrent.input, action: "apply", fingerprint: concurrentPreview.fingerprint })));
  assert.equal(attempts.filter(attempt => attempt.status === "fulfilled").length, 1);
  assert.equal(await p.scheduleTemplate.count({ where: { groupId: concurrent.group.id } }), 4);
  console.log("PASS: two simultaneous confirmations commit only once");

  await fixture("00 Для ручной проверки", { fixedDay: 3, credit: 45000 });
  const sick = await fixture("08 Проверка справки");
  // Deliberately reproduce a missing invoice in this disposable QA database.
  await p.invoice.delete({ where: { id: sick.invoice.id } });
  await p.subscription.update({ where: { id: sick.subscription.id }, data: { paymentStatus: "NOT_INVOICED" } });
  await p.childGroupMembership.updateMany({ where: { childId: sick.child.id }, data: { startDate: date("2026-10-01") } });
  const sicknessLesson = await p.lesson.create({ data: { schoolId: school.id, groupId: sick.group.id, branchId: branch.id, coachId: coach.id,
    lessonDate: date("2026-10-19"), startTime: "10:00", endTime: "11:00" } });
  const sickness = await p.attendanceRecord.create({ data: { childId: sick.child.id, lessonId: sicknessLesson.id, status: "ABSENT_SICK_PENDING", markedAt: date("2026-10-19") } });
  await syncBillingControlTasks(admin);
  const reminder = await p.task.findFirstOrThrow({ where: { childId: sick.child.id, relatedEntityType: "BillingControl:2026-11" } });
  assert.equal(reminder.assigneeUserId, admin.id);
  await p.task.update({ where: { id: reminder.id }, data: { status: "CLOSED" } });
  await syncBillingControlTasks(admin);
  assert.equal((await p.task.findUniqueOrThrow({ where: { id: reminder.id } })).status, "OPEN");
  assert.equal(await p.task.count({ where: { childId: sick.child.id, relatedEntityType: "BillingControl:2026-11" } }), 1);
  await ensureMonthlySubscriptionsForGroup(admin, "2026-11", stale.group.id);
  const otherGroupTask = await p.task.findFirstOrThrow({ where: { childId: stale.child.id, relatedEntityType: "BillingReconciliation:2026-11", status: "OPEN" } });
  await resolveBillingSickness(admin, sickness.id, { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "QA справка проверена" });
  await resolveBillingSickness(admin, sickness.id, { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "QA повторный запрос" });
  assert.equal(await p.makeupCredit.count({ where: { sourceAttendanceRecordId: sickness.id } }), 1);
  assert.equal(await p.invoice.count({ where: { childId: sick.child.id } }), 1);
  assert.equal((await p.invoice.findFirstOrThrow({ where: { childId: sick.child.id } })).amountKopeks, 360000);
  assert.equal((await p.task.findUniqueOrThrow({ where: { id: otherGroupTask.id } })).status, "OPEN", "Scoped reconciliation must not close another group's issue");
  await syncBillingControlTasks(admin);
  assert.equal((await p.task.findUniqueOrThrow({ where: { id: reminder.id } })).status, "CLOSED");
  console.log("PASS: persistent assigned reminders reopen without duplicate, medical review creates one transfer/invoice and closes resolved reminder");
  const manualSicknessLesson = await p.lesson.create({ data: { schoolId: school.id, groupId: sick.group.id, branchId: branch.id, coachId: coach.id,
    lessonDate: date("2026-10-21"), startTime: "10:00", endTime: "11:00" } });
  await p.attendanceRecord.create({ data: { childId: sick.child.id, lessonId: manualSicknessLesson.id, status: "ABSENT_SICK_PENDING", markedAt: date("2026-10-21") } });
  console.log(JSON.stringify({ school: school.id, manualGroup: "00 Для ручной проверки", login: admin.login, password: "Schedule-QA-2026!", note: "LOCAL QA ONLY" }));
} finally { await p.$disconnect(); }
