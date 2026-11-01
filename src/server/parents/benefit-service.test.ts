import { beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ parent: { findFirstOrThrow: vi.fn(), update: vi.fn() }, child: { count: vi.fn() }, audit: vi.fn(), raw: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: mocks.audit }));
import { requestBenefit, reviewBenefit, reviewBenefitSchema } from "./benefit-service";
const tx = { parent: mocks.parent, child: mocks.child, $queryRaw: mocks.raw } as unknown as Prisma.TransactionClient;
const admin = { id: "admin", schoolId: "school", role: "ADMIN", login: "admin", displayName: "Admin" } as CurrentUser;
const parent = { id: "parent", benefitCategory: "LARGE_FAMILY", benefitStatus: "PENDING", updatedAt: new Date("2026-11-01T00:00:00.000Z") };
const input = { category: "LARGE_FAMILY", status: "APPROVED", reason: "Подтверждено", expectedUpdatedAt: parent.updatedAt.toISOString() } as const;
beforeEach(() => { vi.resetAllMocks(); mocks.transaction.mockImplementation(fn => fn(tx)); mocks.parent.findFirstOrThrow.mockResolvedValue(parent); mocks.parent.update.mockImplementation(({data}) => ({ ...parent, ...data })); mocks.child.count.mockResolvedValue(2); });
it("only creates a pending claim from parent registration", async () => {
  await requestBenefit(tx, { ...admin, role: "PARENT" }, parent.id, "MILITARY_FAMILY");
  expect(mocks.parent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ benefitStatus: "PENDING" }) }));
});
it("cannot replace an approved benefit by registering another child", async () => {
  mocks.parent.findFirstOrThrow.mockResolvedValue({ ...parent, benefitStatus: "APPROVED" });
  await requestBenefit(tx, admin, parent.id, "MILITARY_FAMILY"); expect(mocks.parent.update).not.toHaveBeenCalled();
});
it.each(["PARENT", "COACH"] as const)("rejects review by %s", async role => {
  await expect(reviewBenefit({ ...admin, role }, parent.id, input)).rejects.toThrow(); expect(mocks.transaction).not.toHaveBeenCalled();
});
it.each(["ADMIN", "SUPER_ADMIN"] as const)("allows %s and audits the reason without writing any invoice", async role => {
  await reviewBenefit({ ...admin, role }, parent.id, input);
  expect(mocks.parent.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: parent.id, schoolId: admin.schoolId, archivedAt: null } });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "PARENT_BENEFIT_REVIEWED", newValue: expect.objectContaining({ reason: input.reason }) }), tx);
});
it("rejects stale decisions", async () => {
  await expect(reviewBenefit(admin, parent.id, { ...input, expectedUpdatedAt: "2026-10-01T00:00:00.000Z" })).rejects.toThrow("Данные изменились"); expect(mocks.parent.update).not.toHaveBeenCalled();
});
it("requires both sibling cards under the parent before approval", async () => {
  mocks.child.count.mockResolvedValue(1);
  await expect(reviewBenefit(admin, parent.id, { ...input, category: "TWO_CHILDREN" })).rejects.toThrow("обоих детей");
});
it("requires a category and reason and does not accept a client supplied percentage", () => {
  expect(reviewBenefitSchema.safeParse({ ...input, category: null }).success).toBe(false);
  expect(reviewBenefitSchema.safeParse({ ...input, reason: " " }).success).toBe(false);
  expect(reviewBenefitSchema.parse({ ...input, discountPercent: 90 })).not.toHaveProperty("discountPercent");
});
