import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirstOrThrow: vi.fn(), count: vi.fn(), delete: vi.fn(), updateMany: vi.fn() });
  const tx = { branch: model(), trainingGroup: model(), child: model(), lesson: model(), trialParticipant: model(), scheduleTemplate: model() };
  return { tx, transaction: vi.fn(), audit: vi.fn() };
});
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: mocks.audit }));
import { deleteDirectory, validateDirectoryStatus } from "./lifecycle-service";
import type { Prisma } from "@/generated/prisma/client";
const admin = { id: "admin", schoolId: "school", role: "ADMIN", login: "admin", displayName: "Admin" } as CurrentUser;
const tx = mocks.tx as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn) => fn(mocks.tx));
  for (const model of Object.values(mocks.tx)) model.count.mockResolvedValue(0);
});

describe("directory lifecycle safety", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as const)("allows %s to delete an empty group in their school", async (role) => {
    mocks.tx.trainingGroup.findFirstOrThrow.mockResolvedValue({ id: "g", name: "Group", status: "ACTIVE", _count: { children: 0, tasks: 0 } });
    await deleteDirectory({ ...admin, role }, "groups", "g");
    expect(mocks.tx.trainingGroup.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: "g", schoolId: "school" }, include: { _count: true } });
    expect(mocks.tx.trainingGroup.delete).toHaveBeenCalledWith({ where: { id: "g" } });
    expect(mocks.audit).toHaveBeenCalled();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });
  it("rejects a coach before accessing the database", async () => {
    await expect(deleteDirectory({ ...admin, role: "COACH" }, "branches", "b")).rejects.toThrow("Недостаточно прав");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("protects even archived financial history", async () => {
    mocks.tx.trainingGroup.findFirstOrThrow.mockResolvedValue({ id: "g", name: "Group", status: "ARCHIVED", _count: { subscriptions: 2, childMemberships: 1 } });
    await expect(deleteDirectory(admin, "groups", "g")).rejects.toThrow("абонементы и счета: 2");
    expect(mocks.tx.trainingGroup.delete).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("will not delete a branch with archived groups", async () => {
    mocks.tx.branch.findFirstOrThrow.mockResolvedValue({ id: "b", _count: { groups: 1 } });
    await expect(deleteDirectory(admin, "branches", "b")).rejects.toThrow("группы: 1");
    expect(mocks.tx.branch.delete).not.toHaveBeenCalled();
  });
  it("requires groups to be archived before their branch", async () => {
    mocks.tx.trainingGroup.count.mockResolvedValue(1);
    await expect(validateDirectoryStatus(tx, admin, "branches", "b", "ARCHIVED")).rejects.toThrow("Сначала архивируйте");
  });
  it.each(["child", "lesson", "trialParticipant"] as const)("blocks archive with unresolved %s", async (model) => {
    mocks.tx[model].count.mockResolvedValue(1);
    await expect(validateDirectoryStatus(tx, admin, "groups", "g", "ARCHIVED")).rejects.toThrow();
    expect(mocks.tx.scheduleTemplate.updateMany).not.toHaveBeenCalled();
  });
  it("archives templates without deleting attendance or money", async () => {
    await validateDirectoryStatus(tx, admin, "groups", "g", "ARCHIVED");
    expect(mocks.tx.scheduleTemplate.updateMany).toHaveBeenCalledWith({ where: { schoolId: "school", groupId: "g" }, data: { status: "ARCHIVED" } });
    expect(mocks.tx.lesson.delete).not.toHaveBeenCalled();
  });
  it("will not restore a group into an archived branch", async () => {
    mocks.tx.trainingGroup.findFirstOrThrow.mockResolvedValue({ branch: { status: "ARCHIVED" } });
    await expect(validateDirectoryStatus(tx, admin, "groups", "g", "ACTIVE")).rejects.toThrow("Сначала восстановите филиал");
  });
});
