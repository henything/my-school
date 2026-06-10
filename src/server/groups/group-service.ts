import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ensureGroupOverCapacityTask } from "@/server/tasks/task-service";
import { countActiveChildren } from "./capacity";
import type { AttachChildToGroupInput, CreateGroupInput, UpdateGroupInput } from "./schemas";

type GroupRecord = {
  id: string;
  name: string;
  status: string;
  capacityLimit: number;
  inventoryNotes: string | null;
  comment: string | null;
  createdAt: Date;
  branch: {
    id: string;
    name: string;
  };
  mainCoach: {
    id: string;
    user: {
      id: string;
      displayName: string;
      login: string;
      status: string;
    };
  };
  children: Array<{
    id: string;
    status: string;
  }>;
};

const groupInclude = {
  branch: { select: { id: true, name: true } },
  mainCoach: {
    select: {
      id: true,
      user: { select: { id: true, displayName: true, login: true, status: true } }
    }
  },
  children: { select: { id: true, status: true } }
} as const;

export function serializeGroup(group: GroupRecord) {
  const activeChildrenCount = countActiveChildren(group.children);

  return {
    id: group.id,
    name: group.name,
    status: group.status,
    capacityLimit: group.capacityLimit,
    activeChildrenCount,
    isOverCapacity: activeChildrenCount > group.capacityLimit,
    inventoryNotes: group.inventoryNotes,
    comment: group.comment,
    branch: group.branch,
    mainCoach: {
      id: group.mainCoach.id,
      userId: group.mainCoach.user.id,
      displayName: group.mainCoach.user.displayName,
      login: group.mainCoach.user.login,
      status: group.mainCoach.user.status
    },
    createdAt: group.createdAt.toISOString()
  };
}

export async function listGroups(currentUser: CurrentUser) {
  const groups = await getPrisma().trainingGroup.findMany({
    where: { schoolId: currentUser.schoolId },
    include: groupInclude,
    orderBy: [{ status: "asc" }, { name: "asc" }]
  });

  return groups.map(serializeGroup);
}

export async function createGroup(currentUser: CurrentUser, input: CreateGroupInput) {
  return getPrisma().$transaction(async (tx) => {
    await tx.branch.findFirstOrThrow({
      where: {
        id: input.branchId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      }
    });

    await tx.coachProfile.findFirstOrThrow({
      where: {
        id: input.mainCoachId,
        schoolId: currentUser.schoolId,
        user: {
          role: "COACH",
          status: "ACTIVE"
        }
      }
    });

    const group = await tx.trainingGroup.create({
      data: {
        schoolId: currentUser.schoolId,
        branchId: input.branchId,
        mainCoachId: input.mainCoachId,
        name: input.name,
        capacityLimit: input.capacityLimit,
        inventoryNotes: input.inventoryNotes,
        comment: input.comment
      },
      include: groupInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "GROUP_CREATED",
        entityType: "Group",
        entityId: group.id,
        newValue: serializeGroup(group)
      },
      tx
    );

    return serializeGroup(group);
  });
}

export async function updateGroup(currentUser: CurrentUser, groupId: string, input: UpdateGroupInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.trainingGroup.findFirstOrThrow({
      where: {
        id: groupId,
        schoolId: currentUser.schoolId
      }
    });

    if (input.branchId) {
      await tx.branch.findFirstOrThrow({
        where: {
          id: input.branchId,
          schoolId: currentUser.schoolId,
          status: { not: "ARCHIVED" }
        }
      });
    }

    if (input.mainCoachId) {
      await tx.coachProfile.findFirstOrThrow({
        where: {
          id: input.mainCoachId,
          schoolId: currentUser.schoolId,
          user: {
            role: "COACH",
            status: "ACTIVE"
          }
        }
      });
    }

    const group = await tx.trainingGroup.update({
      where: { id: existing.id },
      data: input,
      include: groupInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "GROUP_UPDATED",
        entityType: "Group",
        entityId: group.id,
        oldValue: {
          name: existing.name,
          status: existing.status,
          branchId: existing.branchId,
          mainCoachId: existing.mainCoachId,
          capacityLimit: existing.capacityLimit
        },
        newValue: {
          name: group.name,
          status: group.status,
          branchId: group.branch.id,
          mainCoachId: group.mainCoach.id,
          capacityLimit: group.capacityLimit
        }
      },
      tx
    );

    await ensureGroupOverCapacityTask(tx, {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      groupId: group.id,
      groupName: group.name,
      activeChildrenCount: countActiveChildren(group.children),
      capacityLimit: group.capacityLimit
    });

    return serializeGroup(group);
  });
}

export async function attachChildToGroup(currentUser: CurrentUser, groupId: string, input: AttachChildToGroupInput) {
  return getPrisma().$transaction(async (tx) => {
    const group = await tx.trainingGroup.findFirstOrThrow({
      where: {
        id: groupId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      },
      include: groupInclude
    });

    const child = await tx.child.findFirstOrThrow({
      where: {
        id: input.childId,
        schoolId: currentUser.schoolId
      }
    });

    if (child.currentGroupId && child.currentGroupId !== group.id) {
      throw new Error("Ребёнок уже состоит в другой группе. Используйте перевод ребёнка.");
    }

    if (child.currentGroupId === group.id) {
      return serializeGroup(group);
    }

    await tx.child.update({
      where: { id: child.id },
      data: { currentGroupId: group.id }
    });

    const updatedGroup = await tx.trainingGroup.findUniqueOrThrow({
      where: { id: group.id },
      include: groupInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "CHILD_ATTACHED_TO_GROUP",
        entityType: "Child",
        entityId: child.id,
        oldValue: { currentGroupId: child.currentGroupId },
        newValue: { currentGroupId: group.id }
      },
      tx
    );

    await ensureGroupOverCapacityTask(tx, {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      groupId: updatedGroup.id,
      groupName: updatedGroup.name,
      activeChildrenCount: countActiveChildren(updatedGroup.children),
      capacityLimit: updatedGroup.capacityLimit
    });

    return serializeGroup(updatedGroup);
  });
}
