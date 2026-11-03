import { beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
import type { Prisma } from "@/generated/prisma/client";
const mocks = vi.hoisted(() => ({ parent: { findFirstOrThrow: vi.fn(), update: vi.fn() }, evidence: { create: vi.fn() }, createTask: vi.fn(), closeTasks: vi.fn(), child: { count: vi.fn() }, audit: vi.fn(), raw: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/server/tasks/task-service", () => ({ createTaskIfNotExists: mocks.createTask, closeTasksByCondition: mocks.closeTasks }));
import { requestBenefit, reviewBenefit, reviewBenefitSchema } from "./benefit-service";
const tx = { parent: mocks.parent, parentBenefitEvidence: mocks.evidence, child: mocks.child, $queryRaw: mocks.raw } as unknown as Prisma.TransactionClient;
const admin = { id: "admin", schoolId: "school", role: "ADMIN", login: "admin", displayName: "Admin" } as CurrentUser;
const parent = { id: "parent", benefitCategory: "LARGE_FAMILY", benefitStatus: "PENDING", updatedAt: new Date("2026-11-01T00:00:00.000Z") };
const input = { category: "LARGE_FAMILY", status: "APPROVED", reason: "Подтверждено", expectedUpdatedAt: parent.updatedAt.toISOString() } as const;
const file = { originalFileName: "proof.pdf", mimeType: "application/pdf", fileSizeBytes: 8, content: new Uint8Array([37, 80, 68, 70, 45]) };
beforeEach(() => { vi.resetAllMocks(); mocks.transaction.mockImplementation(fn => fn(tx)); mocks.parent.findFirstOrThrow.mockResolvedValue(parent); mocks.parent.update.mockImplementation(({data}) => ({ ...parent, ...data })); mocks.child.count.mockResolvedValue(2); mocks.evidence.create.mockResolvedValue({ id: "evidence", createdAt: new Date("2026-11-03T10:00:00Z") }); });
it("only creates a pending claim from parent registration", async () => {
  await requestBenefit(tx, { ...admin, role: "PARENT" }, parent.id, "MILITARY_FAMILY", file);
  expect(mocks.parent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ benefitStatus: "PENDING", benefitEvidenceId: "evidence", benefitProvisionalCategory: "MILITARY_FAMILY" }) }));
  expect(mocks.createTask).toHaveBeenCalledWith(tx, expect.objectContaining({ type: "BENEFIT_REVIEW_REQUIRED", relatedEntityId: parent.id }));
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
  expect(mocks.closeTasks).toHaveBeenCalledWith(tx, expect.objectContaining({ where: expect.objectContaining({ relatedEntityId: parent.id }) }));
});
it("requires evidence for a new claim and does not create a task on failure", async () => {
  await expect(requestBenefit(tx, admin, parent.id, "LARGE_FAMILY")).rejects.toThrow("документ");
  expect(mocks.createTask).not.toHaveBeenCalled();
});
it("reuses evidence when registering a sibling without resetting the provisional month", async () => {
  mocks.parent.findFirstOrThrow.mockResolvedValue({ ...parent, benefitEvidenceId: "proof", benefitFirstInvoiceMonth: new Date("2026-11-01"), benefitProvisionalCategory: "LARGE_FAMILY" });
  await requestBenefit(tx, admin, parent.id, "LARGE_FAMILY");
  expect(mocks.evidence.create).not.toHaveBeenCalled();
  expect(mocks.parent.update).not.toHaveBeenCalled();
});
it("a new proof after rejection never grants another first month", async () => {
  mocks.parent.findFirstOrThrow.mockResolvedValue({ ...parent, benefitStatus: "REJECTED", benefitFirstInvoiceMonth: new Date("2026-11-01"), benefitProvisionalCategory: "LARGE_FAMILY" });
  await requestBenefit(tx, admin, parent.id, "MILITARY_FAMILY", file);
  const data = mocks.parent.update.mock.calls[0][0].data;
  expect(data).not.toHaveProperty("benefitFirstInvoiceMonth");
  expect(data.benefitProvisionalCategory).toBe("LARGE_FAMILY");
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
