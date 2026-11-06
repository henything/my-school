/** Run only against a disposable local schedule_pipeline_qa database. No real parent/medical data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "../src/server/db/prisma";
import { hashPassword } from "../src/server/auth/password";
import { buildLessonCandidates } from "../src/server/schedule/generation";
import { ensureCurrentMonthSubscriptionForChild, ensureMonthlySubscriptionsForGroup } from "../src/server/billing/billing-service";
import { reviewMedicalCertificate } from "../src/server/medical-certificates/medical-certificate-service";
import { reconcileApprovedMedicalCertificates } from "../src/server/medical-certificates/period-service";
import { finalizeAttendance } from "../src/server/makeups/makeup-service";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
assert(["localhost", "127.0.0.1"].includes(dbUrl.hostname) && dbUrl.pathname.includes("schedule_pipeline_qa"), "Disposable LOCAL QA database required");
const p = getPrisma();
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const run = randomUUID().slice(0, 8);
// Disposable PNG fixture, not a real medical document.
const fixtureImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5z8AAAAASUVORK5CYII=", "base64");
const fixtureDirectory = path.join(process.cwd(), ".local", "medical-certificates");
await mkdir(fixtureDirectory, { recursive: true });
const school = await p.school.create({ data: { name: `QA справки ${run}`, slug: `certificate-qa-${run}` } });
const admin = await p.user.create({ data: { schoolId: school.id, role: "SUPER_ADMIN", login: `certificate-qa-${run}`, displayName: "Администратор QA", passwordHash: await hashPassword("Certificate-QA-2026!") } });
const coachUser = await p.user.create({ data: { schoolId: school.id, role: "COACH", login: `certificate-coach-${run}`, displayName: "Тренер QA", passwordHash: "not-a-login-hash" } });
const coach = await p.coachProfile.create({ data: { schoolId: school.id, userId: coachUser.id } });
const branch = await p.branch.create({ data: { schoolId: school.id, name: "Тестовый филиал справок" } });
const group = await p.trainingGroup.create({ data: { schoolId: school.id, branchId: branch.id, mainCoachId: coach.id, name: "Справки — полный период" } });
const templates = [];
for (const weekday of [2, 4]) templates.push(await p.scheduleTemplate.create({ data: { schoolId: school.id, groupId: group.id, branchId: branch.id, coachId: coach.id, weekday, startTime: "10:00", endTime: "11:00" } }));
for (const month of ["2026-10", "2026-11", "2026-12"]) await p.lesson.createMany({ data: buildLessonCandidates(templates, month).map(lesson => ({ schoolId: school.id, ...lesson })) });

async function fixture(name: string, sickDays = ["2026-10-27", "2026-10-29"], options: { linked?: boolean; novemberPaid?: boolean; approved?: boolean } = {}) {
  const parent = await p.parent.create({ data: { schoolId: school.id, fullName: `Родитель ${name}` } });
  const child = await p.child.create({ data: { schoolId: school.id, parentId: parent.id, currentGroupId: group.id, fullName: name } });
  await p.childGroupMembership.create({ data: { childId: child.id, groupId: group.id, startDate: date("2026-10-01") } });
  await p.$transaction(tx => ensureCurrentMonthSubscriptionForChild(tx, admin, child.id, date("2026-10-01")), { timeout: 30000 });
  const october = await p.invoice.findFirstOrThrow({ where: { childId: child.id } });
  await p.invoice.update({ where: { id: october.id }, data: { status: "PAID", paidAmountKopeks: october.amountKopeks, paidAt: new Date() } });
  await p.subscription.update({ where: { id: october.subscriptionId! }, data: { paymentStatus: "PAID" } });
  await p.payment.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id, subscriptionId: october.subscriptionId, invoiceId: october.id, status: "SUCCEEDED", amountKopeks: october.amountKopeks, paidAt: new Date(), provider: "LOCAL_QA" } });
  if (options.novemberPaid) {
    await p.$transaction(tx => ensureCurrentMonthSubscriptionForChild(tx, admin, child.id, date("2026-11-01")), { timeout: 30000 });
    const november = await p.invoice.findFirstOrThrow({ where: { childId: child.id, periodStart: date("2026-11-01") } });
    await p.invoice.update({ where: { id: november.id }, data: { status: "PAID", paidAmountKopeks: november.amountKopeks, paidAt: new Date() } });
    await p.subscription.update({ where: { id: november.subscriptionId! }, data: { paymentStatus: "PAID" } });
    await p.payment.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id, subscriptionId: november.subscriptionId, invoiceId: november.id, status: "SUCCEEDED", amountKopeks: november.amountKopeks, paidAt: new Date(), provider: "LOCAL_QA" } });
  }
  const records = [];
  for (const day of sickDays) {
    const lesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id, lessonDate: date(day) } });
    records.push(await p.attendanceRecord.create({ data: { lessonId: lesson.id, childId: child.id, status: "ABSENT_SICK_PENDING", markedAt: date(day), markedByUserId: coachUser.id } }));
  }
  const certificate = await p.medicalCertificate.create({ data: {
    schoolId: school.id, childId: child.id, attendanceRecordId: options.linked ? records[0]?.id : null,
    status: options.approved ? "APPROVED" : "PENDING", periodStart: date("2026-10-27"), periodEnd: date("2026-10-29"),
    originalFileName: "Тестовая справка.png", storageKey: `local-certificate-qa-${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: fixtureImage.length,
    uploadedByUserId: admin.id, reviewedByUserId: options.approved ? admin.id : null, reviewedAt: options.approved ? date("2026-11-01") : null
  } });
  await writeFile(path.join(fixtureDirectory, certificate.storageKey), fixtureImage);
  return { child, certificate, records, october };
}

try {
  const main = await fixture("01 Без привязки");
  const certificateTask = await p.task.create({ data: {
    schoolId: school.id, type: "CERTIFICATE_PENDING", priority: "HIGH", assigneeUserId: admin.id,
    relatedEntityType: "AttendanceRecord", relatedEntityId: main.records[0].id,
    childId: main.child.id, groupId: group.id, title: "Нужна справка: QA"
  } });
  const returnLesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id, lessonDate: date("2026-11-03") } });
  const returnRecord = await p.attendanceRecord.create({ data: { childId: main.child.id, lessonId: returnLesson.id, status: "PRESENT", markedByUserId: coachUser.id } });
  const initialBilling = await ensureMonthlySubscriptionsForGroup(admin, "2026-11", group.id);
  assert.equal(initialBilling.createdCount, 1);
  assert.equal(initialBilling.issues.length, 0);
  assert.equal(await p.invoice.count({ where: { childId: main.child.id } }), 2);
  const issuedBeforeApproval = await p.invoice.findFirstOrThrow({ where: { childId: main.child.id, periodStart: date("2026-11-01") } });
  assert.equal(issuedBeforeApproval.amountKopeks, 360000);
  assert.equal(await p.makeupCredit.count({ where: { childId: main.child.id } }), 0);
  assert.equal((await p.task.findUniqueOrThrow({ where: { id: certificateTask.id } })).status, "OPEN");
  for (const record of main.records) assert.deepEqual(await p.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } }), record);
  console.log("PASS: pending certificate does not block full November invoice or finalize illness; contact task stays open");
  const paidOctober = await p.invoice.findUniqueOrThrow({ where: { id: main.october.id } });
  const result = await reviewMedicalCertificate(admin, main.certificate.id, { status: "APPROVED" });
  assert.equal(result.application?.finalizedCount, 2);
  assert.equal(await p.makeupCredit.count({ where: { childId: main.child.id, reason: "SICKNESS" } }), 2);
  const november = await p.invoice.findFirstOrThrow({ where: { childId: main.child.id, periodStart: date("2026-11-01") } });
  assert.equal(november.amountKopeks, 360000);
  assert.deepEqual(november, issuedBeforeApproval);
  assert.deepEqual(await p.attendanceRecord.findUniqueOrThrow({ where: { id: returnRecord.id } }), returnRecord);
  assert.equal((await p.task.findUniqueOrThrow({ where: { id: certificateTask.id } })).status, "CLOSED");
  assert.equal(november.status, "ISSUED");
  assert.deepEqual(await p.invoice.findUniqueOrThrow({ where: { id: main.october.id } }), paidOctober);
  const approved = await p.medicalCertificate.findUniqueOrThrow({ where: { id: main.certificate.id } });
  await reviewMedicalCertificate(admin, main.certificate.id, { status: "APPROVED", adminComment: "Повтор" });
  assert.deepEqual(await p.medicalCertificate.findUniqueOrThrow({ where: { id: main.certificate.id } }), approved);
  assert.deepEqual(await p.invoice.findUniqueOrThrow({ where: { id: november.id } }), november);
  assert.equal(await p.makeupCredit.count({ where: { childId: main.child.id } }), 2);
  const decemberBilling = await ensureMonthlySubscriptionsForGroup(admin, "2026-12", group.id, [main.child.id]);
  assert.equal(decemberBilling.createdCount, 1);
  const december = await p.invoice.findFirstOrThrow({ where: { childId: main.child.id, periodStart: date("2026-12-01") } });
  assert.equal(december.amountKopeks, 360000); // 10 December lessons minus 2 confirmed October transfers.
  assert.equal((await p.child.findUniqueOrThrow({ where: { id: main.child.id } })).cachedMakeupBalance, 0);
  await reviewMedicalCertificate(admin, main.certificate.id, { status: "APPROVED" });
  await ensureMonthlySubscriptionsForGroup(admin, "2026-12", group.id, [main.child.id]);
  assert.deepEqual(await p.invoice.findUniqueOrThrow({ where: { id: december.id } }), december);
  assert.equal(await p.makeupCredit.count({ where: { childId: main.child.id } }), 2);
  assert.equal(await p.invoice.count({ where: { childId: main.child.id, periodStart: date("2026-12-01") } }), 1);
  console.log("PASS: late approval preserves issued November invoice and return attendance; December uses compensation exactly once");

  const partial = await fixture("02 Неполная справка", ["2026-10-27", "2026-10-29", "2026-10-20"], { linked: true });
  const sibling = await fixture("03 Другой ребёнок");
  const partialResult = await reviewMedicalCertificate(admin, partial.certificate.id, { status: "APPROVED" });
  assert.equal(partialResult.application?.finalizedCount, 2);
  assert.equal(await p.attendanceRecord.count({ where: { childId: partial.child.id, finalStatus: null } }), 1);
  const partialInvoice = await p.invoice.findFirstOrThrow({ where: { childId: partial.child.id, periodStart: date("2026-11-01") } });
  assert.equal(partialInvoice.amountKopeks, 270000);
  assert.equal(partialResult.application?.remainingPendingCount, 1);
  assert.equal(partialResult.warning, null);
  assert.equal(await p.invoice.count({ where: { childId: sibling.child.id, periodStart: date("2026-11-01") } }), 0);
  console.log("PASS: partial certificate discounts only covered days; uncovered illness stays pending without blocking bill; other child untouched");

  const concurrent = await fixture("04 Одновременные запросы");
  const attempts = await Promise.allSettled([1, 2].map(() => reviewMedicalCertificate(admin, concurrent.certificate.id, { status: "APPROVED" })));
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 2);
  assert.equal(await p.makeupCredit.count({ where: { childId: concurrent.child.id } }), 2);
  assert.equal(await p.invoice.count({ where: { childId: concurrent.child.id, periodStart: date("2026-11-01") } }), 1);
  console.log("PASS: concurrent approval is idempotent for transfers and invoice");

  const existing = await fixture("05 Уже оплачен ноябрь", undefined, { novemberPaid: true });
  const paidInvoices = await p.invoice.findMany({ where: { childId: existing.child.id }, orderBy: { id: "asc" } });
  const payments = await p.payment.findMany({ where: { childId: existing.child.id }, orderBy: { id: "asc" } });
  await reviewMedicalCertificate(admin, existing.certificate.id, { status: "APPROVED" });
  assert.deepEqual(await p.invoice.findMany({ where: { childId: existing.child.id }, orderBy: { id: "asc" } }), paidInvoices);
  assert.deepEqual(await p.payment.findMany({ where: { childId: existing.child.id }, orderBy: { id: "asc" } }), payments);
  assert.equal((await p.child.findUniqueOrThrow({ where: { id: existing.child.id } })).cachedMakeupBalance, 2);
  console.log("PASS: existing paid invoices/payments immutable; late transfers remain available");

  const overlap = await p.medicalCertificate.create({ data: { ...approved, id: randomUUID(), attendanceRecordId: null, storageKey: randomUUID(), periodStart: date("2026-10-26"), createdAt: undefined, updatedAt: undefined } });
  await reviewMedicalCertificate(admin, overlap.id, { status: "APPROVED" });
  assert.equal(await p.makeupCredit.count({ where: { childId: main.child.id } }), 2);
  await assert.rejects(reviewMedicalCertificate({ ...admin, role: "COACH" }, sibling.certificate.id, { status: "APPROVED" }));
  await assert.rejects(reviewMedicalCertificate({ ...admin, schoolId: randomUUID() }, sibling.certificate.id, { status: "APPROVED" }));
  console.log("PASS: overlapping approved periods do not duplicate credit; role and school boundaries enforced");

  const late = await fixture("06 Поздняя отметка", ["2026-10-27"], { approved: true });
  await reconcileApprovedMedicalCertificates(admin);
  await ensureMonthlySubscriptionsForGroup(admin, "2026-11", undefined, [late.child.id]);
  const lateInvoice = await p.invoice.findFirstOrThrow({ where: { childId: late.child.id, periodStart: date("2026-11-01") } });
  assert.equal(lateInvoice.amountKopeks, 315000);
  const lateLesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id, lessonDate: date("2026-10-29") } });
  const lateRecord = await p.attendanceRecord.create({ data: { childId: late.child.id, lessonId: lateLesson.id, status: "ABSENT_SICK_PENDING" } });
  await reconcileApprovedMedicalCertificates(admin);
  assert.equal((await p.attendanceRecord.findUniqueOrThrow({ where: { id: lateRecord.id } })).finalStatus, "ABSENT_SICK_CONFIRMED");
  assert.equal(await p.makeupCredit.count({ where: { childId: late.child.id } }), 2);
  assert.deepEqual(await p.invoice.findUniqueOrThrow({ where: { id: lateInvoice.id } }), lateInvoice);
  await reconcileApprovedMedicalCertificates(admin);
  assert.equal(await p.makeupCredit.count({ where: { childId: late.child.id } }), 2);
  console.log("PASS: daily reconciliation repairs old approved periods and late marks without rewriting an issued invoice");

  const protectedCase = await fixture("07 Защищённые отметки");
  await p.medicalCertificate.update({ where: { id: protectedCase.certificate.id }, data: { periodStart: date("2026-10-01") } });
  const protectedRecords = [];
  for (const [day, status, finalStatus] of [
    ["2026-10-01", "PRESENT", null], ["2026-10-06", "NOT_MARKED", null],
    ["2026-10-08", "ABSENT_UNEXCUSED", null], ["2026-10-13", "ABSENT_QUARANTINE", null],
    ["2026-10-15", "ABSENT_UNEXCUSED", "ABSENT_UNEXCUSED_FINAL"]
  ] as const) {
    const lesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id, lessonDate: date(day) } });
    protectedRecords.push(await p.attendanceRecord.create({ data: { childId: protectedCase.child.id, lessonId: lesson.id, status, finalStatus } }));
  }
  const cancelledLesson = await p.lesson.create({ data: { schoolId: school.id, groupId: group.id, branchId: branch.id, coachId: coach.id, lessonDate: date("2026-10-22"), startTime: "12:00", endTime: "13:00", status: "CANCELLED" } });
  const cancelledRecord = await p.attendanceRecord.create({ data: { childId: protectedCase.child.id, lessonId: cancelledLesson.id, status: "ABSENT_SICK_PENDING" } });
  protectedRecords.push(cancelledRecord);
  await reviewMedicalCertificate(admin, protectedCase.certificate.id, { status: "APPROVED" });
  for (const record of protectedRecords) assert.deepEqual(await p.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } }), record);
  assert.equal(await p.makeupCredit.count({ where: { childId: protectedCase.child.id } }), 2);
  assert.equal((await p.invoice.findFirstOrThrow({ where: { childId: protectedCase.child.id, periodStart: date("2026-11-01") } })).amountKopeks, 270000);
  console.log("PASS: present/unmarked/paid/quarantine/finalized and cancelled lessons are preserved; cancelled pending does not block invoice");

  const race = await fixture("08 Решение администратора");
  const medicalAndManual = await Promise.allSettled([
    reviewMedicalCertificate(admin, race.certificate.id, { status: "APPROVED" }),
    finalizeAttendance(admin, race.records[0].id, { finalStatus: "ABSENT_UNEXCUSED_FINAL", comment: "QA ручное решение" })
  ]);
  assert.equal(medicalAndManual[0].status, "fulfilled");
  const final = await p.attendanceRecord.findUniqueOrThrow({ where: { id: race.records[0].id } });
  assert.equal(await p.makeupCredit.count({ where: { sourceAttendanceRecordId: final.id } }), final.finalStatus === "ABSENT_SICK_CONFIRMED" ? 1 : 0);
  assert.equal(await p.makeupCredit.count({ where: { childId: race.child.id } }), final.finalStatus === "ABSENT_SICK_CONFIRMED" ? 2 : 1);
  console.log("PASS: concurrent explicit absence decision cannot overwrite confirmed illness or duplicate transfers");

  const archived = await fixture("09 Архив — не применять автоматически", undefined, { approved: true });
  await p.child.update({ where: { id: archived.child.id }, data: { status: "ARCHIVED" } });
  await reconcileApprovedMedicalCertificates(admin);
  assert.equal(await p.makeupCredit.count({ where: { childId: archived.child.id } }), 0);
  assert.equal(await p.attendanceRecord.count({ where: { childId: archived.child.id, finalStatus: null } }), 2);
  console.log("PASS: daily recovery leaves archived children unchanged");

  const manual = await fixture("00 Для ручной проверки");
  await ensureMonthlySubscriptionsForGroup(admin, "2026-11", group.id, [manual.child.id]);
  await p.task.create({ data: { schoolId: school.id, type: "CERTIFICATE_PENDING", priority: "HIGH", assigneeUserId: admin.id,
    relatedEntityType: "AttendanceRecord", relatedEntityId: manual.records[0].id, childId: manual.child.id,
    groupId: group.id, title: "Нужна справка: 00 Для ручной проверки" } });
  await fixture("00 Уже одобрена — применить", undefined, { approved: true });
  console.log(JSON.stringify({ login: admin.login, password: "Certificate-QA-2026!", schoolId: school.id, note: "LOCAL QA ONLY" }));
} finally { await p.$disconnect(); }
