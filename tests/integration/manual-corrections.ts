import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/server/db/prisma";
import { hashPassword } from "../../src/server/auth/password";
import { previewCorrection, applyCorrection, correctionHistory } from "../../src/server/billing/manual-correction-service";
import { correctionInputSchema, type CorrectionInput } from "../../src/server/billing/manual-correction-rules";
import { getRecalculationPreview, applyRecalculation } from "../../src/server/billing/recalculation-service";
import type { CurrentUser } from "../../src/server/auth/current-user";

const db = new URL(process.env.DATABASE_URL!);
assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(db.hostname) && db.pathname.startsWith("/azbuka_correction_qa_"), "Integration must run in a disposable local database");
const p = getPrisma();
let count = 0;
async function check(name: string, run: () => Promise<void>) { await run(); count++; console.log(`PASS ${name}`); }
try {
  const school = await p.school.create({ data: { name: "Проверка корректировок", slug: "correction-qa" } });
  const user = await p.user.create({ data: { schoolId: school.id, login: "correction-test", displayName: "Администратор проверки", role: "ADMIN", passwordHash: await hashPassword("Correction-demo-2026!") } });
  const admin: CurrentUser = { id: user.id, schoolId: school.id, login: user.login, displayName: user.displayName, role: "ADMIN" };
  const parent = await p.parent.create({ data: { schoolId: school.id, fullName: "Родитель для проверки" } });
  const child = await p.child.create({ data: { schoolId: school.id, parentId: parent.id, fullName: "Проверка корректировок", cachedLessonBalance: 9 } });
  await p.lessonBalanceTransaction.create({ data: { schoolId: school.id, childId: child.id, type: "SUBSCRIPTION_CREATED", balanceType: "LESSON_BALANCE", amount: 9, createdByUserId: user.id } });
  const invoice = await p.invoice.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id, createdByUserId: user.id, number: "Проверка 4050", amountKopeks: 405000, dueDate: new Date("2026-11-30"), periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30") } });
  const readChild = () => p.child.findUniqueOrThrow({ where: { id: child.id } });
  const readInvoice = () => p.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  const money = (rubles: string): CorrectionInput => correctionInputSchema.parse({ kind: "INVOICE_AMOUNT", invoiceId: invoice.id, targetAmountRub: rubles, reason: "Проверка суммы" });
  const lesson = (quantity = 2): CorrectionInput => ({ kind: "LESSON_BALANCE", childId: child.id, direction: "ADD", quantity, reason: "Проверка занятий" });
  async function apply(input: CorrectionInput, id = randomUUID()) { const preview = await previewCorrection(admin, input); return applyCorrection(admin, input, id, preview.version); }
  await check("4050 -> 3000 -> 2250 changes only invoice, repeated target is a no-op", async () => {
    await apply(money("3000")); await apply(money("2250")); await apply(money("2250"));
    assert.equal((await readInvoice()).amountKopeks,225000); assert.equal((await readInvoice()).manualAdjustmentKopeks,-180000);
    assert.equal((await readChild()).cachedLessonBalance,9); assert.equal(await p.payment.count(),0);
  });
  await check("same request retries and double click add lessons once", async () => {
    const input = lesson(); const preview = await previewCorrection(admin,input); const operationId = randomUUID();
    const results = await Promise.all([applyCorrection(admin,input,operationId,preview.version),applyCorrection(admin,input,operationId,preview.version)]);
    assert.equal(results[0].nextValue,11); assert.equal(results[1].nextValue,11); assert.equal((await readChild()).cachedLessonBalance,11);
    await assert.rejects(applyCorrection(admin,lesson(3),operationId,preview.version), /уже использован/);
  });
  await check("two different changes cannot apply one stale preview", async () => {
    const input = lesson(); const preview = await previewCorrection(admin,input);
    const results = await Promise.allSettled([applyCorrection(admin,input,randomUUID(),preview.version),applyCorrection(admin,input,randomUUID(),preview.version)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal((await readChild()).cachedLessonBalance,13);
  });
  await check("reversal uses current balance and can run only once", async () => {
    const operation = await p.billingCorrectionOperation.findFirstOrThrow({ where: { kind: "LESSON_BALANCE", delta: 2 }, orderBy: { createdAt: "asc" } });
    const input: CorrectionInput = { kind: "REVERSE", operationId: operation.id, reason: "Отмена ошибки" };
    const preview = await previewCorrection(admin,input); const op = randomUUID(); await applyCorrection(admin,input,op,preview.version);
    assert.equal((await readChild()).cachedLessonBalance,11);
    await applyCorrection(admin,input,op,preview.version); // replay remains valid after original is reversed
    await assert.rejects(previewCorrection(admin,input), /уже отменена/);
  });
  await check("legacy 3000/2250 lessons are reversed by linked exact movements", async () => {
    for (const amount of [3000,2250]) {
      const tx = await p.lessonBalanceTransaction.create({ data: { schoolId: school.id, childId: child.id, type: "MANUAL_ADJUSTMENT", balanceType: "LESSON_BALANCE", amount, reason: "MANUAL_ADJUSTMENT", createdByUserId: user.id } });
      await p.child.update({ where: { id: child.id }, data: { cachedLessonBalance: { increment: amount } } });
      const input: CorrectionInput = { kind: "REVERSE", transactionId: tx.id, reason: "Отмена старой ошибки" };
      await apply(input); await assert.rejects(previewCorrection(admin,input), /ещё не отменена/);
    }
    assert.equal((await readChild()).cachedLessonBalance,11);
  });
  await check("cash payment and even an unsuccessful checkout prevent invoice editing", async () => {
    await p.paymentAttempt.create({ data: { invoiceId: invoice.id, parentId: parent.id, schoolId: school.id, provider: "QA", amountKopeks: 225000, status: "FAILED" } });
    await assert.rejects(previewCorrection(admin,money("2000")), /онлайн-оплата/);
    await p.paymentAttempt.deleteMany();
    const preview = await previewCorrection(admin,money("2000"));
    await p.invoice.update({ where: { id: invoice.id }, data: { paidAmountKopeks: 1 } });
    await assert.rejects(applyCorrection(admin,money("2000"),randomUUID(),preview.version), /оплата/);
    assert.equal((await readInvoice()).amountKopeks,225000);
    await p.invoice.update({ where: { id: invoice.id }, data: { paidAmountKopeks: 0 } });
  });
  await check("roles and school scope prevent access", async () => {
    await assert.rejects(previewCorrection({ ...admin, role: "COACH" },lesson()));
    await assert.rejects(previewCorrection({ ...admin, role: "PARENT" },money("1000")));
    await assert.rejects(previewCorrection({ ...admin, schoolId: randomUUID() },lesson()));
  });
  await check("invoice cancellation is zero with no fictitious payment and protected reversal", async () => {
    const operation = await p.billingCorrectionOperation.findFirstOrThrow({ where: { invoiceId: invoice.id, delta: -75000 } });
    await apply({ kind: "REVERSE", operationId: operation.id, reason: "Проверка отмены суммы" });
    assert.equal((await readInvoice()).amountKopeks,300000);
    await apply(money("0")); assert.equal((await readInvoice()).status,"CANCELLED"); assert.equal(await p.payment.count(),0);
    await assert.rejects(previewCorrection(admin,money("2250")), /Статус/);
  });
  await check("history preserves units and author and marks reversals", async () => {
    const history = await correctionHistory(admin,child.id);
    assert(history.some(x=>x.reversed)); assert(history.every(x=>x.actor===user.displayName));
    assert(history.some(x=>x.kind==='INVOICE_AMOUNT' && x.delta===-105000));
  });
  await check("schedule recalculation keeps concession, compensates paid reduction once", async () => {
    const branch = await p.branch.create({ data: { schoolId: school.id, name: "Тестовый филиал" } });
    const coachUser = await p.user.create({ data: { schoolId: school.id, login: "qa-coach", displayName: "Тренер проверки", role: "COACH", passwordHash: user.passwordHash } });
    const coach = await p.coachProfile.create({ data: { schoolId: school.id, userId: coachUser.id } });
    const group = await p.trainingGroup.create({ data: { schoolId: school.id, name: "Тестовая группа", branchId: branch.id, mainCoachId: coach.id } });
    const member = await p.child.create({ data: { schoolId: school.id, parentId: parent.id, fullName: "Проверка пересчёта", currentGroupId: group.id, cachedLessonBalance: 9, groupMemberships: { create: { groupId: group.id, startDate: new Date("2026-11-01") } } } });
    const sub = await p.subscription.create({ data: { schoolId: school.id, childId: member.id, groupId: group.id, periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30"), plannedLessonsCount: 9, totalAmountKopeks: 405000, createdByUserId: user.id } });
    const bill = await p.invoice.create({ data: { schoolId: school.id, childId: member.id, parentId: parent.id, subscriptionId: sub.id, number: "Пересчёт", amountKopeks: 405000, dueDate: new Date("2026-11-30"), createdByUserId: user.id } });
    for (let n=1;n<=8;n++) await p.lesson.create({ data: { schoolId: school.id, groupId: group.id, branchId: branch.id, coachId: coach.id, lessonDate: new Date(`2026-11-${String(n).padStart(2,'0')}`), startTime: "16:00", endTime: "17:00" } });
    const input = correctionInputSchema.parse({ kind: "INVOICE_AMOUNT", invoiceId: bill.id, targetAmountRub: "2250", reason: "Индивидуальная поправка" }); await apply(input);
    const recalc = await getRecalculationPreview(admin,sub.id);
    assert.equal(recalc.nextInvoiceAmountKopeks,180000);
    await applyRecalculation(admin,sub.id,{ reason: "Изменено расписание", expectedSubscriptionUpdatedAt: recalc.subscriptionUpdatedAt, expectedInvoiceUpdatedAt: recalc.invoiceUpdatedAt!, expectedLessonIds: recalc.nextLessons.map(x=>x.id) });
    assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: bill.id } })).manualAdjustmentKopeks,-180000);
    const preview = await previewCorrection(admin,correctionInputSchema.parse({ kind: "INVOICE_AMOUNT", invoiceId: bill.id, targetAmountRub: "2000", reason: "Поправка после пересчёта" }));
    assert.equal(preview.ordinaryKopeks,360000);
    // A later paid period keeps its original cash invoice and compensates only the reduction.
    await p.invoice.update({ where: { id: bill.id }, data: { status: "PAID", paidAmountKopeks: 180000, paidAt: new Date() } });
    const lastLesson = await p.lesson.findFirstOrThrow({ where: { groupId: group.id }, orderBy: { lessonDate: "desc" } });
    await p.lesson.update({ where: { id: lastLesson.id }, data: { status: "CANCELLED" } });
    const paidPreview = await getRecalculationPreview(admin,sub.id);
    assert.equal(paidPreview.paidDifferenceKopeks,45000);
    await applyRecalculation(admin,sub.id,{ reason: "Подтверждённая болезнь", paidDifferenceAction: "CREDIT", expectedSubscriptionUpdatedAt: paidPreview.subscriptionUpdatedAt, expectedInvoiceUpdatedAt: paidPreview.invoiceUpdatedAt!, expectedLessonIds: paidPreview.nextLessons.map(x=>x.id) });
    assert.equal((await p.invoice.findUniqueOrThrow({ where: { id: bill.id } })).amountKopeks,180000);
    assert.equal((await p.billingAdjustment.aggregate({ where: { sourceInvoiceId: bill.id }, _sum: { amountKopeks: true } }))._sum.amountKopeks,45000);
    assert.equal((await getRecalculationPreview(admin,sub.id)).additionalCreditKopeks,0);
  });
  await check("unused money credits are preserved and benefit is not reapplied", async () => {
    const credited = await p.invoice.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id, createdByUserId: user.id, number: "Со скидкой и зачётом", amountBeforeDiscountKopeks: 360000, discountPercent: 10, discountAmountKopeks: 36000, amountKopeks: 279000, dueDate: new Date("2026-11-30") } });
    const credit = await p.billingAdjustment.create({ data: { schoolId: school.id, childId: child.id, parentId: parent.id, kind: "CREDIT", amountKopeks: 45000, appliedAmountKopeks: 45000, reason: "Ранее оплачено", createdByUserId: user.id } });
    await p.billingAdjustmentApplication.create({ data: { adjustmentId: credit.id, invoiceId: credited.id, amountKopeks: 45000 } });
    await apply(correctionInputSchema.parse({ kind: "INVOICE_AMOUNT", invoiceId: credited.id, targetAmountRub: "2250", reason: "Ручная поправка" }));
    const result = await p.invoice.findUniqueOrThrow({ where: { id: credited.id } });
    assert.equal(result.manualAdjustmentKopeks,-54000); assert.equal(result.discountAmountKopeks,36000); assert.equal(result.manualBasisKopeks,324000);
    assert.equal((await p.billingAdjustment.findUniqueOrThrow({ where: { id: credit.id } })).appliedAmountKopeks,45000);
  });
  await check("failed audit write rolls back balance and operation atomically", async () => {
    const original = (await readChild()).cachedLessonBalance;
    await p.$executeRawUnsafe(`CREATE FUNCTION fail_correction_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'BILLING_CORRECTION_APPLIED' THEN RAISE EXCEPTION 'QA simulated audit failure'; END IF; RETURN NEW; END $$`);
    await p.$executeRawUnsafe(`CREATE TRIGGER qa_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_correction_audit()`);
    await assert.rejects(apply(lesson()));
    assert.equal((await readChild()).cachedLessonBalance,original);
    await p.$executeRawUnsafe(`DROP TRIGGER qa_fail_audit ON audit_logs`);
    await p.$executeRawUnsafe(`DROP FUNCTION fail_correction_audit()`);
  });
  console.log(`Integration: ${count} scenarios passed`);
  // Dedicated, fictitious account for manual acceptance, kept outside the test school's financial data.
  const demoSchool = await p.school.create({ data: { name: "Демо ручных корректировок", slug: "manual-correction-demo" } });
  const demoAdmin = await p.user.create({ data: { schoolId: demoSchool.id, login: "correction-admin", displayName: "Тестовый администратор", role: "ADMIN", passwordHash: user.passwordHash } });
  const demoParent = await p.parent.create({ data: { schoolId: demoSchool.id, fullName: "Тестовый родитель" } });
  const demoChild = await p.child.create({ data: { schoolId: demoSchool.id, parentId: demoParent.id, fullName: "Тестовый ребёнок — корректировка", cachedLessonBalance: 9 } });
  await p.lessonBalanceTransaction.create({ data: { schoolId: demoSchool.id, childId: demoChild.id, createdByUserId: demoAdmin.id, type: "SUBSCRIPTION_CREATED", balanceType: "LESSON_BALANCE", amount: 9 } });
  await p.invoice.create({ data: { schoolId: demoSchool.id, childId: demoChild.id, parentId: demoParent.id, createdByUserId: demoAdmin.id, number: "Демо ноябрь", amountKopeks: 405000, dueDate: new Date("2026-11-30"), periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30") } });
} finally { await p.$disconnect(); }
