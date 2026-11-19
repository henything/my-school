import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { CALCULATED_PAYMENT_STATUS_MESSAGE } from "@/lib/payment-status";
import { createParentInvoicePayment, handleYooKassaWebhook } from "@/server/payments/payment-service";
import { createSubscription, listSubscriptions, markInvoicePaidManually, updateChildPaymentStatus } from "./billing-service";

// Enable only through the disposable-database runner: pnpm test:payments:integration.
describe.skipIf(!process.env.SBP_TEST_DATABASE_URL)("payment services with PostgreSQL", () => {
  const prisma = getPrisma;
  let admin: CurrentUser;
  let parentUser: CurrentUser;
  let parentId: string;
  let groupId: string;

  beforeAll(async () => {
    const url = new URL(process.env.SBP_TEST_DATABASE_URL!);
    if (!url.pathname.startsWith("/azbuka_sbp_test_")) throw new Error("Use the disposable payment test database.");
    vi.stubEnv("DATABASE_URL", url.toString());
    vi.stubEnv("YOOKASSA_SHOP_ID", "test-shop");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "test-key");
    const school = await prisma().school.create({ data: { name: "СБП тест", slug: randomUUID() } });
    const user = await prisma().user.create({ data: {
      schoolId: school.id, login: "payment-admin", displayName: "Администратор", role: "ADMIN", passwordHash: "unused"
    } });
    admin = { id: user.id, schoolId: school.id, login: user.login, displayName: user.displayName, role: user.role };
    const parent = await prisma().parent.create({ data: { schoolId: school.id, fullName: "Родитель СБП", phone: "+79990000001" } });
    parentId = parent.id;
    const userParent = await prisma().user.create({ data: {
      schoolId: school.id, login: "payment-parent", displayName: "Родитель", role: "PARENT", passwordHash: "unused"
    } });
    parentUser = { id: userParent.id, schoolId: school.id, login: userParent.login, displayName: userParent.displayName, role: userParent.role };
    await prisma().parentAccount.create({ data: { schoolId: school.id, parentId, userId: parentUser.id, status: "ACTIVE" } });
    const coach = await prisma().coachProfile.create({ data: { schoolId: school.id, userId: user.id } });
    const branch = await prisma().branch.create({ data: { schoolId: school.id, name: "Тестовый филиал" } });
    const group = await prisma().trainingGroup.create({ data: {
      schoolId: school.id, name: "Тестовая группа", branchId: branch.id, mainCoachId: coach.id
    } });
    groupId = group.id;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { await prisma().$disconnect(); vi.unstubAllEnvs(); });

  async function fixture(makeupCount = 0) {
    const child = await prisma().child.create({ data: {
      schoolId: admin.schoolId, parentId, fullName: randomUUID(), currentGroupId: groupId, cachedMakeupBalance: makeupCount
    } });
    for (let i = 0; i < makeupCount; i++) {
      await prisma().makeupCredit.create({ data: {
        schoolId: admin.schoolId, childId: child.id, groupId, reason: "SICKNESS",
        createdAt: new Date("2026-10-01"), createdByUserId: admin.id
      } });
    }
    const subscription = await createSubscription(admin, {
      childId: child.id, periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30"),
      plannedLessonsCount: 2, lessonPriceKopeks: 45000, totalAmountKopeks: undefined, paymentStatus: "NOT_INVOICED"
    });
    const invoice = await prisma().invoice.findFirstOrThrow({ where: { subscriptionId: subscription.id } });
    return { child, subscription, invoice };
  }

  it.each(["PAID", "PARTIALLY_PAID"] as const)("rejects direct %s through service calls without writes", async (status) => {
    const { child } = await fixture();
    const before = await prisma().auditLog.count();
    await expect(updateChildPaymentStatus(admin, child.id, { status, comment: "Обход HTTP" })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
    await expect(createSubscription(admin, {
      childId: child.id, periodStart: new Date("2026-12-01"), periodEnd: new Date("2026-12-31"),
      plannedLessonsCount: 2, lessonPriceKopeks: 45000, totalAmountKopeks: undefined, paymentStatus: status
    })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
    expect(await prisma().subscription.count({ where: { childId: child.id } })).toBe(1);
    expect(await prisma().auditLog.count()).toBe(before);
  });

  it("keeps unpaid manual status changes, then prevents reset after partial and full manual payments", async () => {
    const { child, subscription, invoice } = await fixture();
    const updated = await updateChildPaymentStatus(admin, child.id, { status: "NOT_PAID", comment: "Ожидаем оплату" });
    expect(updated.paymentStatus).toBe("NOT_PAID");
    expect(updated.manualPaymentStatusLocked).toBe(false);
    const partial = await markInvoicePaidManually(admin, invoice.id, { amountKopeks: 20000, comment: "Исключение: перевод" });
    expect(partial.status).toBe("PARTIALLY_PAID");
    expect(partial.paidAmountKopeks).toBe(20000);
    await expect(updateChildPaymentStatus(admin, child.id, { status: "NOT_PAID", comment: "Сброс" })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
    const full = await markInvoicePaidManually(admin, invoice.id, { comment: "Доплата остатка" });
    expect(full.status).toBe("PAID");
    expect(full.paidAmountKopeks).toBe(invoice.amountKopeks);
    const payments = await prisma().payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments.map(p => p.provider)).toEqual(["MANUAL", "MANUAL"]);
    const audit = await prisma().auditLog.findFirstOrThrow({ where: { entityId: invoice.id, action: "INVOICE_MARKED_PAID_MANUALLY", comment: "Доплата остатка" } });
    expect(audit.actorUserId).toBe(admin.id);
    expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.newValue).toMatchObject({ amountKopeks: 70000 });
    expect((await listSubscriptions(admin)).find(s => s.id === subscription.id)?.manualPaymentStatusLocked).toBe(true);
    await expect(markInvoicePaidManually(admin, invoice.id, { comment: "Повтор" })).rejects.toThrow("Счёт уже оплачен");
  });

  it.each(["successful-payment", "paid-invoice", "legacy-paid-status", "invoice-only-payment"])("protects historical payment evidence: %s", async (kind) => {
    const { child, subscription, invoice } = await fixture();
    if (kind === "legacy-paid-status") {
      await prisma().subscription.update({ where: { id: subscription.id }, data: { paymentStatus: "PAID" } });
    } else if (kind === "paid-invoice") {
      await prisma().invoice.update({ where: { id: invoice.id }, data: { paidAmountKopeks: 10000 } });
    } else {
      await prisma().payment.create({ data: {
        schoolId: admin.schoolId, invoiceId: invoice.id, parentId, childId: child.id,
        subscriptionId: kind === "invoice-only-payment" ? null : subscription.id, provider: "MANUAL", status: "SUCCEEDED", amountKopeks: 10000
      } });
    }
    const before = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    const auditCount = await prisma().auditLog.count();
    expect((await listSubscriptions(admin)).find(s => s.id === subscription.id)?.manualPaymentStatusLocked).toBe(true);
    await expect(updateChildPaymentStatus(admin, child.id, { status: "OVERDUE", comment: "Нельзя сбросить" })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
    expect(await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } })).toEqual(before);
    expect(await prisma().auditLog.count()).toBe(auditCount);
  });

  it("rejects invalid manual payments without adding a payment or successful audit", async () => {
    const { invoice } = await fixture();
    for (const input of [{ comment: "   " }, { amountKopeks: 100000, comment: "Лишняя сумма" }, { amountKopeks: 0, comment: "Ноль" }]) {
      await expect(markInvoicePaidManually(admin, invoice.id, input)).rejects.toThrow();
    }
    await prisma().invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
    await expect(markInvoicePaidManually(admin, invoice.id, { comment: "Отменён" })).rejects.toThrow("Отменённый счёт");
    expect(await prisma().payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma().auditLog.count({ where: { entityId: invoice.id, action: "INVOICE_MARKED_PAID_MANUALLY" } })).toBe(0);
  });

  it.each([1, 2])("retains automatic makeup coverage (%i credits) without fictitious receipts", async (credits) => {
    const { child, subscription, invoice } = await fixture(credits);
    expect(invoice.amountKopeks).toBe((2 - credits) * 45000);
    expect(subscription.paymentStatus).toBe(credits === 2 ? "PAID" : "INVOICED");
    expect(subscription.manualPaymentStatusLocked).toBe(credits === 2);
    expect(await prisma().payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    if (credits === 2) {
      await expect(updateChildPaymentStatus(admin, child.id, { status: "NOT_PAID", comment: "Сброс зачёта" })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
    } else {
      expect((await markInvoicePaidManually(admin, invoice.id, { comment: "Оплачен остаток" })).status).toBe("PAID");
    }
  });

  it("creates only SBP, confirms through provider GET and applies a successful webhook once", async () => {
    const { child, invoice, subscription } = await fixture();
    const providerId = randomUUID();
    let requestBody: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") requestBody = JSON.parse(String(options.body));
      return Response.json({
        id: providerId, status: options?.method === "POST" ? "pending" : "succeeded", paid: !options?.method,
        amount: { value: "900.00", currency: "RUB" }, metadata: { schoolId: admin.schoolId, invoiceId: invoice.id },
        confirmation: { type: "redirect", confirmation_url: "https://example.test/sbp" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await createParentInvoicePayment(parentUser, invoice.id, "http://localhost:3000")).toEqual({ checkoutUrl: "https://example.test/sbp" });
    expect(requestBody.payment_method_data).toEqual({ type: "sbp" });
    expect((await prisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmountKopeks).toBe(0);
    const notification = { type: "notification", event: "payment.succeeded", object: {
      id: providerId, status: "succeeded", metadata: { schoolId: admin.schoolId }
    } };
    await handleYooKassaWebhook(notification);
    expect(await handleYooKassaWebhook(notification)).toMatchObject({ duplicate: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await prisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmountKopeks).toBe(90000);
    expect(await prisma().payment.count({ where: { invoiceId: invoice.id, status: "SUCCEEDED" } })).toBe(1);
    expect((await prisma().paymentAttempt.findFirstOrThrow({ where: { invoiceId: invoice.id } })).status).toBe("SUCCEEDED");
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } })).paymentStatus).toBe("PAID");
    await expect(updateChildPaymentStatus(admin, child.id, { status: "NOT_PAID", comment: "Сброс" })).rejects.toThrow(CALCULATED_PAYMENT_STATUS_MESSAGE);
  });

  it("does not fall back to another payment method when the provider rejects SBP", async () => {
    const { invoice } = await fixture();
    const fetchMock = vi.fn(async () => Response.json({ description: "СБП недоступна" }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createParentInvoicePayment(parentUser, invoice.id, "http://localhost:3000")).rejects.toThrow("СБП недоступна");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = await prisma().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.status).toBe("ISSUED");
    expect(stored.paidAmountKopeks).toBe(0);
    expect((await prisma().paymentAttempt.findFirstOrThrow({ where: { invoiceId: invoice.id } })).status).toBe("FAILED");
  });

  it("does not allow parents/coaches or another school to register manual payments", async () => {
    const { child, invoice } = await fixture();
    for (const role of ["PARENT", "COACH"] as const) {
      await expect(markInvoicePaidManually({ ...admin, role }, invoice.id, { comment: "Нет прав" })).rejects.toThrow();
      await expect(updateChildPaymentStatus({ ...admin, role }, child.id, { status: "NOT_PAID", comment: "Нет прав" })).rejects.toThrow();
    }
    const otherSchool = await prisma().school.create({ data: { name: "Другая школа", slug: randomUUID() } });
    await expect(markInvoicePaidManually({ ...admin, schoolId: otherSchool.id }, invoice.id, { comment: "Чужой счёт" })).rejects.toThrow();
    await expect(updateChildPaymentStatus({ ...admin, schoolId: otherSchool.id }, child.id, { status: "NOT_PAID", comment: "Чужой ребёнок" })).rejects.toThrow();
    const strangerParent = await prisma().parent.create({ data: { schoolId: admin.schoolId, fullName: "Другой родитель" } });
    await prisma().invoice.update({ where: { id: invoice.id }, data: { parentId: strangerParent.id } });
    vi.stubGlobal("fetch", vi.fn());
    await expect(createParentInvoicePayment(parentUser, invoice.id, "http://localhost:3000")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
