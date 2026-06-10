import { hasRole } from "@/server/rbac/rbac";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { countActiveChildren } from "@/server/groups/capacity";
import { ensureGroupOverCapacityTask } from "@/server/tasks/task-service";
import type { CreateChildInput, UpdateChildInput } from "./schemas";

const childInclude = {
  parent: { select: { id: true, fullName: true, phone: true, vkProfileUrl: true } },
  currentGroup: {
    select: {
      id: true,
      name: true,
      capacityLimit: true,
      branch: { select: { id: true, name: true } },
      mainCoach: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
      children: { select: { id: true, status: true } }
    }
  }
} as const;

type ChildRecord = {
  id: string;
  fullName: string;
  birthDate: Date | null;
  status: string;
  medicalNotes: string | null;
  coachComment: string | null;
  adminComment: string | null;
  admissionStatus: string;
  cachedLessonBalance: number;
  cachedMakeupBalance: number;
  createdAt: Date;
  parent: {
    id: string;
    fullName: string | null;
    phone: string | null;
    vkProfileUrl: string | null;
  } | null;
  currentGroup: {
    id: string;
    name: string;
    capacityLimit: number;
    branch: { id: string; name: string };
    mainCoach: { id: string; userId: string; user: { displayName: string } };
    children: Array<{ id: string; status: string }>;
  } | null;
};

export function serializeChild(child: ChildRecord) {
  const activeChildrenCount = child.currentGroup ? countActiveChildren(child.currentGroup.children) : 0;

  return {
    id: child.id,
    fullName: child.fullName,
    birthDate: child.birthDate?.toISOString().slice(0, 10) ?? null,
    status: child.status,
    medicalNotes: child.medicalNotes,
    coachComment: child.coachComment,
    adminComment: child.adminComment,
    admissionStatus: child.admissionStatus,
    cachedLessonBalance: child.cachedLessonBalance,
    cachedMakeupBalance: child.cachedMakeupBalance,
    parent: child.parent,
    currentGroup: child.currentGroup
      ? {
          id: child.currentGroup.id,
          name: child.currentGroup.name,
          branch: child.currentGroup.branch,
          mainCoach: {
            id: child.currentGroup.mainCoach.id,
            userId: child.currentGroup.mainCoach.userId,
            displayName: child.currentGroup.mainCoach.user.displayName
          },
          capacityLimit: child.currentGroup.capacityLimit,
          activeChildrenCount,
          isOverCapacity: activeChildrenCount > child.currentGroup.capacityLimit
        }
      : null,
    createdAt: child.createdAt.toISOString()
  };
}

export async function listChildren(currentUser: CurrentUser) {
  const children = await getPrisma().child.findMany({
    where: { schoolId: currentUser.schoolId },
    include: childInclude,
    orderBy: [{ status: "asc" }, { fullName: "asc" }]
  });

  return children.map(serializeChild);
}

export async function createChild(currentUser: CurrentUser, input: CreateChildInput) {
  return getPrisma().$transaction(async (tx) => {
    if (input.parentId) {
      await tx.parent.findFirstOrThrow({
        where: {
          id: input.parentId,
          schoolId: currentUser.schoolId
        }
      });
    }

    if (input.currentGroupId) {
      await tx.trainingGroup.findFirstOrThrow({
        where: {
          id: input.currentGroupId,
          schoolId: currentUser.schoolId,
          status: { not: "ARCHIVED" }
        }
      });
    }

    const child = await tx.child.create({
      data: {
        schoolId: currentUser.schoolId,
        parentId: input.parentId,
        currentGroupId: input.currentGroupId,
        fullName: input.fullName,
        birthDate: input.birthDate,
        status: input.status,
        medicalNotes: input.medicalNotes,
        coachComment: input.coachComment,
        adminComment: input.adminComment,
        admissionStatus: input.admissionStatus
      },
      include: childInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "CHILD_CREATED",
        entityType: "Child",
        entityId: child.id,
        newValue: serializeChild(child)
      },
      tx
    );

    if (child.currentGroup) {
      await ensureGroupOverCapacityTask(tx, {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        groupId: child.currentGroup.id,
        groupName: child.currentGroup.name,
        activeChildrenCount: countActiveChildren(child.currentGroup.children),
        capacityLimit: child.currentGroup.capacityLimit
      });
    }

    return serializeChild(child);
  });
}

export async function updateChild(currentUser: CurrentUser, childId: string, input: UpdateChildInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.child.findFirstOrThrow({
      where: {
        id: childId,
        schoolId: currentUser.schoolId
      },
      include: childInclude
    });

    const isAdmin = hasRole(currentUser, ["SUPER_ADMIN", "ADMIN"]);
    const isCoach = currentUser.role === "COACH";

    if (isCoach) {
      const coachCanAccess = existing.currentGroup?.mainCoach.userId === currentUser.id;
      const attemptedAdminOnlyChange =
        input.fullName !== undefined ||
        input.parentId !== undefined ||
        input.currentGroupId !== undefined ||
        input.birthDate !== undefined ||
        input.status !== undefined ||
        input.adminComment !== undefined ||
        input.admissionStatus !== undefined;

      if (!coachCanAccess || attemptedAdminOnlyChange) {
        throw new Error("Недостаточно прав для изменения карточки ребёнка.");
      }
    }

    if (!isAdmin && !isCoach) {
      throw new Error("Недостаточно прав для изменения карточки ребёнка.");
    }

    if (input.parentId) {
      await tx.parent.findFirstOrThrow({
        where: {
          id: input.parentId,
          schoolId: currentUser.schoolId
        }
      });
    }

    if (input.currentGroupId) {
      await tx.trainingGroup.findFirstOrThrow({
        where: {
          id: input.currentGroupId,
          schoolId: currentUser.schoolId,
          status: { not: "ARCHIVED" }
        }
      });
    }

    const updated = await tx.child.update({
      where: { id: existing.id },
      data: input,
      include: childInclude
    });

    if (existing.currentGroup?.id !== updated.currentGroup?.id) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_TRANSFERRED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: {
            currentGroupId: existing.currentGroup?.id ?? null,
            currentGroupName: existing.currentGroup?.name ?? null
          },
          newValue: {
            currentGroupId: updated.currentGroup?.id ?? null,
            currentGroupName: updated.currentGroup?.name ?? null
          }
        },
        tx
      );
    }

    if (existing.adminComment !== updated.adminComment) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_ADMIN_COMMENT_UPDATED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: { adminComment: existing.adminComment },
          newValue: { adminComment: updated.adminComment }
        },
        tx
      );
    }

    if (existing.medicalNotes !== updated.medicalNotes) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_MEDICAL_NOTES_UPDATED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: { medicalNotes: existing.medicalNotes },
          newValue: { medicalNotes: updated.medicalNotes }
        },
        tx
      );
    }

    for (const group of [existing.currentGroup, updated.currentGroup]) {
      if (group) {
        const freshGroup = await tx.trainingGroup.findUniqueOrThrow({
          where: { id: group.id },
          include: { children: { select: { id: true, status: true } } }
        });

        await ensureGroupOverCapacityTask(tx, {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          groupId: freshGroup.id,
          groupName: freshGroup.name,
          activeChildrenCount: countActiveChildren(freshGroup.children),
          capacityLimit: freshGroup.capacityLimit
        });
      }
    }

    return serializeChild(updated);
  });
}
