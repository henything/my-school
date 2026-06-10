import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";

export function serializeTask(task: {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string | null;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: Date;
}) {
  return {
    id: task.id,
    type: task.type,
    priority: task.priority,
    title: task.title,
    description: task.description,
    status: task.status,
    relatedEntityType: task.relatedEntityType,
    relatedEntityId: task.relatedEntityId,
    createdAt: task.createdAt.toISOString()
  };
}

export async function listTasks(currentUser: CurrentUser) {
  const tasks = await getPrisma().task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      status: { in: ["OPEN", "IN_PROGRESS"] }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }]
  });

  return tasks.map(serializeTask);
}

export async function listMyTasks(currentUser: CurrentUser) {
  const tasks = await getPrisma().task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      assigneeUserId: currentUser.id,
      status: { in: ["OPEN", "IN_PROGRESS"] }
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }]
  });

  return tasks.map(serializeTask);
}

export async function ensureGroupOverCapacityTask(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    actorUserId: string;
    groupId: string;
    groupName: string;
    activeChildrenCount: number;
    capacityLimit: number;
  }
) {
  if (input.activeChildrenCount <= input.capacityLimit) {
    return null;
  }

  const existing = await tx.task.findFirst({
    where: {
      schoolId: input.schoolId,
      type: "GROUP_OVER_CAPACITY",
      groupId: input.groupId,
      status: { in: ["OPEN", "IN_PROGRESS"] }
    }
  });

  if (existing) {
    return existing;
  }

  return tx.task.create({
    data: {
      schoolId: input.schoolId,
      type: "GROUP_OVER_CAPACITY",
      priority: "HIGH",
      assigneeUserId: input.actorUserId,
      relatedEntityType: "Group",
      relatedEntityId: input.groupId,
      groupId: input.groupId,
      title: `Группа "${input.groupName}" переполнена`,
      description: `Активных детей: ${input.activeChildrenCount}. Лимит: ${input.capacityLimit}.`
    }
  });
}
