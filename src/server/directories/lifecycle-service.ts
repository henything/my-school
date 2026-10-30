import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { writeAuditLog } from "@/server/audit/audit-service";
import { todayInMoscow } from "@/server/children/attendance-plan";

export type DirectoryKind = "branches" | "groups";

function assertAdmin(user: CurrentUser) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Недостаточно прав.");
}

// Also used by the existing PATCH endpoints so status edits cannot bypass the checks.
export async function validateDirectoryStatus(tx: Prisma.TransactionClient, user: CurrentUser, kind: DirectoryKind, id: string, status?: string) {
  if (!status) return;
  assertAdmin(user);
  if (kind === "branches") {
    if (status === "ARCHIVED" && await tx.trainingGroup.count({ where: { branchId: id, schoolId: user.schoolId, status: { not: "ARCHIVED" } } })) {
      throw new Error("Сначала архивируйте все группы филиала.");
    }
    return;
  }
  if (status !== "ARCHIVED") {
    const group = await tx.trainingGroup.findFirstOrThrow({ where: { id, schoolId: user.schoolId }, include: { branch: true } });
    if (group.branch.status === "ARCHIVED") throw new Error("Сначала восстановите филиал из архива.");
    return;
  }
  const children = await tx.child.count({ where: { schoolId: user.schoolId, currentGroupId: id, status: { in: ["ACTIVE", "PAUSED", "TRIAL"] } } });
  if (children) throw new Error(`В группе есть действующие дети (${children}). Сначала переведите их или оформите уход.`);
  const lessons = await tx.lesson.count({ where: { schoolId: user.schoolId, groupId: id, lessonDate: { gte: todayInMoscow() }, status: { in: ["SCHEDULED", "ATTENDANCE_PENDING"] } } });
  if (lessons) throw new Error(`В группе есть предстоящие занятия (${lessons}). Сначала отмените их в расписании.`);
  const trials = await tx.trialParticipant.count({ where: { schoolId: user.schoolId, groupId: id, status: { in: ["TRIAL_BOOKED", "TRIAL_ATTENDED", "CONTACT_COLLECTED", "WANTS_TO_CONTINUE", "TRANSFERRED_TO_ADMIN"] } } });
  if (trials) throw new Error(`В группе есть незавершённые заявки на пробное (${trials}). Сначала завершите работу с ними.`);
  await tx.scheduleTemplate.updateMany({ where: { schoolId: user.schoolId, groupId: id }, data: { status: "ARCHIVED" } });
}

const relationLabels: Record<string, string> = {
  groups: "группы", children: "карточки детей", childMemberships: "история участия детей",
  subscriptions: "абонементы и счета", subscriptionLessons: "расчётные занятия", scheduleTemplates: "шаблоны расписания",
  lessons: "занятия и табели", tasks: "задачи", makeupCredits: "переносы занятий", groupEvents: "события группы", trialParticipants: "пробные занятия"
};

export async function deleteDirectory(user: CurrentUser, kind: DirectoryKind, id: string) {
  assertAdmin(user);
  return getPrisma().$transaction(async (tx) => {
    const where = { id, schoolId: user.schoolId };
    const record = kind === "branches"
      ? await tx.branch.findFirstOrThrow({ where, include: { _count: true } })
      : await tx.trainingGroup.findFirstOrThrow({ where, include: { _count: true } });
    const dependencies = Object.entries(record._count).filter(([, count]) => count > 0).map(([key, count]) => `${relationLabels[key] ?? key}: ${count}`);
    if (dependencies.length) throw new Error(`Удаление невозможно — есть связанные данные: ${dependencies.join(", ")}. Используйте архивирование, чтобы сохранить историю.`);
    if (kind === "branches") await tx.branch.delete({ where: { id: record.id } });
    else await tx.trainingGroup.delete({ where: { id: record.id } });
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: kind === "branches" ? "BRANCH_DELETED" : "GROUP_DELETED", entityType: kind === "branches" ? "Branch" : "Group", entityId: record.id, oldValue: { name: record.name, status: record.status } }, tx);
    return { deleted: true };
  }, { isolationLevel: "Serializable" });
}
