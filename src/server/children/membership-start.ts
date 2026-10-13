import { z } from "zod";
import type { CurrentUser } from "@/server/auth/current-user";
import { writeAuditLog } from "@/server/audit/audit-service";
import { todayInMoscow } from "@/server/children/attendance-plan";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { requiredCommentSchema } from "@/server/shared/schemas";

export const updateMembershipStartSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату начала.")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Некорректная дата начала.")
    .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  reason: requiredCommentSchema
});

export async function updateMembershipStart(
  currentUser: CurrentUser,
  childId: string,
  input: z.infer<typeof updateMembershipStartSchema>
) {
  assertRole(currentUser, ADMIN_ROLES);
  if (input.startDate > todayInMoscow()) throw new Error("Дата начала не может быть в будущем.");

  return getPrisma().$transaction(async (tx) => {
    const child = await tx.child.findFirstOrThrow({
      where: { id: childId, schoolId: currentUser.schoolId, status: "ACTIVE", currentGroupId: { not: null } },
      select: { id: true, currentGroupId: true }
    });
    const current = await tx.childGroupMembership.findFirstOrThrow({
      where: { childId, groupId: child.currentGroupId!, endDate: null },
      orderBy: { startDate: "desc" }
    });
    if (current.startDate.getTime() === input.startDate.getTime()) return current;

    const trial = await tx.trialParticipant.findFirst({
      where: { convertedChildId: childId, groupId: child.currentGroupId! },
      include: { lesson: { select: { lessonDate: true } } },
      orderBy: { lesson: { lessonDate: "desc" } }
    });
    if (trial && input.startDate <= trial.lesson.lessonDate) {
      throw new Error("Дата начала платных занятий должна быть позже пробного.");
    }
    const lesson = await tx.lesson.findFirst({
      where: {
        schoolId: currentUser.schoolId,
        groupId: child.currentGroupId!,
        lessonDate: input.startDate,
        status: { not: "CANCELLED" }
      },
      select: { id: true }
    });
    if (!lesson) throw new Error("В группе нет занятия на выбранную дату начала.");

    const overlapping = await tx.childGroupMembership.findMany({
      where: {
        childId,
        id: { not: current.id },
        startDate: { lt: current.startDate },
        endDate: { gt: input.startDate }
      }
    });
    if (overlapping.some((membership) => membership.groupId !== current.groupId)) {
      throw new Error("Дата пересекается с участием в другой группе. Сначала исправьте историю перевода.");
    }
    if (overlapping.some((membership) => membership.startDate < input.startDate)) {
      throw new Error("Дата пересекается с прежним периодом в группе. Проверьте историю участия.");
    }
    if (overlapping.length > 0) {
      await tx.childGroupMembership.deleteMany({ where: { id: { in: overlapping.map((membership) => membership.id) } } });
    }

    const updated = await tx.childGroupMembership.update({
      where: { id: current.id },
      data: { startDate: input.startDate }
    });
    await writeAuditLog({
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "CHILD_GROUP_START_DATE_CORRECTED",
      entityType: "Child",
      entityId: childId,
      oldValue: { groupId: current.groupId, startDate: current.startDate.toISOString().slice(0, 10) },
      newValue: { groupId: updated.groupId, startDate: updated.startDate.toISOString().slice(0, 10) },
      comment: input.reason
    }, tx);
    return updated;
  });
}
