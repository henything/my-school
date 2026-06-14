import type { Prisma } from "@/generated/prisma/client";
import type { TaskPriority, TaskStatus, TaskType } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { countActiveChildren } from "@/server/groups/capacity";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import type { CloseTaskInput, CreateManualTaskInput, TaskChecksInput } from "./schemas";

const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];
const OPERATIONAL_TASK_TYPES: TaskType[] = [
  "ATTENDANCE_NOT_FILLED",
  "CHILD_TOOK_CREDIT_LESSON",
  "CHILD_NOT_ADMITTED",
  "SICKNESS_FOLLOW_UP",
  "CERTIFICATE_PENDING",
  "MAKEUP_NEEDS_ASSIGNMENT",
  "GROUP_OVER_CAPACITY",
  "TRIAL_NEEDS_PROCESSING",
  "ABSENCE_NEEDS_FINALIZATION",
  "COACH_SUBSTITUTION_ASSIGNED",
  "CHILD_WITHOUT_ACTIVE_SUBSCRIPTION"
];

const taskInclude = {
  assigneeUser: { select: { id: true, displayName: true, login: true, role: true } },
  closedByUser: { select: { id: true, displayName: true, login: true, role: true } },
  child: { select: { id: true, fullName: true, admissionStatus: true, cachedLessonBalance: true } },
  group: { select: { id: true, name: true, capacityLimit: true } }
} as const;

const taskOrderBy: Prisma.TaskOrderByWithRelationInput[] = [{ priority: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }];

type TaskRecord = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

type CreateTaskIfNotExistsInput = {
  schoolId: string;
  type: TaskType;
  priority: TaskPriority;
  assigneeUserId?: string | null;
  relatedEntityType: string;
  relatedEntityId: string;
  title: string;
  description?: string | null;
  dueAt?: Date | null;
  childId?: string | null;
  groupId?: string | null;
  actorUserId?: string | null;
};

type CloseTasksByConditionInput = {
  schoolId: string;
  actorUserId?: string | null;
  where: Prisma.TaskWhereInput;
  comment?: string | null;
  status?: Extract<TaskStatus, "CLOSED" | "CANCELLED">;
};

export function serializeTask(task: TaskRecord) {
  return {
    id: task.id,
    type: task.type,
    priority: task.priority,
    title: task.title,
    description: task.description,
    status: task.status,
    assigneeUser: task.assigneeUser,
    relatedEntityType: task.relatedEntityType,
    relatedEntityId: task.relatedEntityId,
    dueAt: task.dueAt?.toISOString() ?? null,
    closedAt: task.closedAt?.toISOString() ?? null,
    closedByUser: task.closedByUser,
    closedComment: task.closedComment,
    child: task.child,
    group: task.group,
    createdAt: task.createdAt.toISOString()
  };
}

export function buildTaskDedupeWhere(input: Pick<CreateTaskIfNotExistsInput, "schoolId" | "type" | "relatedEntityType" | "relatedEntityId" | "assigneeUserId">) {
  return {
    schoolId: input.schoolId,
    type: input.type,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    assigneeUserId: input.assigneeUserId ?? null,
    status: { in: OPEN_TASK_STATUSES }
  } satisfies Prisma.TaskWhereInput;
}

export function requiresCloseComment(task: Pick<TaskRecord, "priority" | "type">) {
  return (
    task.priority === "CRITICAL" ||
    task.type === "CHILD_NOT_ADMITTED" ||
    task.type === "CHILD_TOOK_CREDIT_LESSON" ||
    task.type === "ATTENDANCE_NOT_FILLED"
  );
}

export async function listTasks(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const tasks = await getPrisma().task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      status: { in: OPEN_TASK_STATUSES }
    },
    include: taskInclude,
    orderBy: taskOrderBy
  });

  return tasks.map(serializeTask);
}

export async function listMyTasks(currentUser: CurrentUser) {
  return getTasksForUser(currentUser);
}

export async function getTasksForUser(currentUser: CurrentUser) {
  if (hasRole(currentUser, ADMIN_ROLES)) {
    return listTasks(currentUser);
  }

  if (currentUser.role !== "COACH") {
    throw new Error("Недостаточно прав.");
  }

  const prisma = getPrisma();
  const lessonIds = await findCoachRelatedLessonIds(prisma, currentUser);
  const tasks = await prisma.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      status: { in: OPEN_TASK_STATUSES },
      OR: [
        { assigneeUserId: currentUser.id },
        {
          relatedEntityType: "Lesson",
          relatedEntityId: { in: lessonIds }
        }
      ]
    },
    include: taskInclude,
    orderBy: taskOrderBy
  });

  return tasks.map(serializeTask);
}

export async function getOperationalTasksForAdmin(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const now = new Date();
  const endOfToday = endOfPacificDay(now);
  const tasks = await getPrisma().task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      status: { in: OPEN_TASK_STATUSES },
      OR: [{ priority: { in: ["CRITICAL", "HIGH"] } }, { dueAt: { lte: endOfToday } }, { type: { in: OPERATIONAL_TASK_TYPES } }]
    },
    include: taskInclude,
    orderBy: taskOrderBy
  });

  return tasks.map(serializeTask);
}

export async function createManualTask(currentUser: CurrentUser, input: CreateManualTaskInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    await assertTaskReferences(tx, currentUser.schoolId, input);

    const task = await tx.task.create({
      data: {
        schoolId: currentUser.schoolId,
        type: "MANUAL_TASK",
        priority: input.priority,
        assigneeUserId: input.assigneeUserId ?? null,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        childId: input.childId ?? null,
        groupId: input.groupId ?? null
      },
      include: taskInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "TASK_MANUALLY_CREATED",
        entityType: "Task",
        entityId: task.id,
        newValue: {
          type: task.type,
          priority: task.priority,
          assigneeUserId: task.assigneeUserId,
          relatedEntityType: task.relatedEntityType,
          relatedEntityId: task.relatedEntityId
        }
      },
      tx
    );

    return serializeTask(task);
  });
}

export async function closeTask(currentUser: CurrentUser, taskId: string, input: CloseTaskInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.task.findFirstOrThrow({
      where: { id: taskId, schoolId: currentUser.schoolId },
      include: taskInclude
    });

    assertCanCloseTask(currentUser, existing);

    if (!OPEN_TASK_STATUSES.includes(existing.status)) {
      throw new Error("Задача уже закрыта.");
    }

    if (requiresCloseComment(existing) && !input.comment) {
      throw new Error("Для закрытия критичной задачи нужен комментарий.");
    }

    const updated = await tx.task.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        closedAt: new Date(),
        closedByUserId: currentUser.id,
        closedComment: input.comment
      },
      include: taskInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: input.status === "CANCELLED" ? "TASK_CANCELLED" : "TASK_CLOSED",
        entityType: "Task",
        entityId: existing.id,
        oldValue: {
          status: existing.status,
          closedAt: existing.closedAt?.toISOString() ?? null
        },
        newValue: {
          status: updated.status,
          closedAt: updated.closedAt?.toISOString() ?? null,
          closedByUserId: currentUser.id,
          closedComment: input.comment
        },
        comment: input.comment
      },
      tx
    );

    return serializeTask(updated);
  });
}

export async function getOperationalCenter(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const prisma = getPrisma();
  const now = new Date();
  const today = dateToKey(now);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const operationalTasks = await getOperationalTasksForAdmin(currentUser);

  const [todayLessons, unfilledLessons, childrenWithoutActiveSubscription, childrenWithDebt, notAdmittedChildren, pendingCertificates, availableMakeups, groups] =
    await Promise.all([
      prisma.lesson.findMany({
        where: { schoolId: currentUser.schoolId, lessonDate: todayDate },
        select: {
          id: true,
          lessonDate: true,
          startTime: true,
          endTime: true,
          status: true,
          group: { select: { id: true, name: true } },
          coach: { select: { user: { select: { displayName: true } } } }
        },
        orderBy: [{ startTime: "asc" }, { group: { name: "asc" } }]
      }),
      prisma.lesson.findMany({
        where: {
          schoolId: currentUser.schoolId,
          lessonDate: { lte: todayDate },
          status: { in: ["SCHEDULED", "ATTENDANCE_PENDING"] }
        },
        select: {
          id: true,
          lessonDate: true,
          startTime: true,
          endTime: true,
          status: true,
          group: { select: { id: true, name: true } }
        },
        orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
        take: 20
      }),
      prisma.child.findMany({
        where: {
          schoolId: currentUser.schoolId,
          status: "ACTIVE",
          currentGroupId: { not: null },
          subscriptions: {
            none: {
              periodStart: { lte: todayDate },
              periodEnd: { gte: todayDate }
            }
          }
        },
        select: {
          id: true,
          fullName: true,
          currentGroup: { select: { id: true, name: true } }
        },
        orderBy: { fullName: "asc" },
        take: 20
      }),
      prisma.child.findMany({
        where: { schoolId: currentUser.schoolId, status: "ACTIVE", cachedLessonBalance: { lt: 0 } },
        select: {
          id: true,
          fullName: true,
          cachedLessonBalance: true,
          admissionStatus: true,
          currentGroup: { select: { id: true, name: true } }
        },
        orderBy: { cachedLessonBalance: "asc" },
        take: 20
      }),
      prisma.child.findMany({
        where: { schoolId: currentUser.schoolId, status: "ACTIVE", admissionStatus: "NOT_ADMITTED" },
        select: {
          id: true,
          fullName: true,
          cachedLessonBalance: true,
          currentGroup: { select: { id: true, name: true } }
        },
        orderBy: { fullName: "asc" },
        take: 20
      }),
      prisma.attendanceRecord.findMany({
        where: {
          status: "ABSENT_SICK_PENDING",
          finalStatus: null,
          lesson: { schoolId: currentUser.schoolId }
        },
        select: {
          id: true,
          markedAt: true,
          child: { select: { id: true, fullName: true } },
          lesson: {
            select: {
              id: true,
              lessonDate: true,
              startTime: true,
              endTime: true,
              group: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: [{ markedAt: "asc" }, { createdAt: "asc" }],
        take: 20
      }),
      prisma.makeupCredit.findMany({
        where: { schoolId: currentUser.schoolId, status: "AVAILABLE" },
        select: {
          id: true,
          reason: true,
          createdAt: true,
          child: { select: { id: true, fullName: true } },
          group: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: "asc" },
        take: 20
      }),
      prisma.trainingGroup.findMany({
        where: { schoolId: currentUser.schoolId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          capacityLimit: true,
          children: { select: { id: true, status: true } }
        },
        orderBy: { name: "asc" }
      })
    ]);

  const groupsOverCapacity = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      capacityLimit: group.capacityLimit,
      activeChildrenCount: countActiveChildren(group.children)
    }))
    .filter((group) => group.activeChildrenCount > group.capacityLimit);
  const criticalTasks = operationalTasks.filter((task) => task.priority === "CRITICAL");
  const highTasks = operationalTasks.filter((task) => task.priority === "HIGH");
  const trialsToProcess = operationalTasks.filter((task) => task.type === "TRIAL_NEEDS_PROCESSING");

  return {
    today,
    widgets: {
      todayLessons: todayLessons.map((lesson) => ({
        id: lesson.id,
        lessonDate: dateToKey(lesson.lessonDate),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        group: lesson.group,
        coachName: lesson.coach.user.displayName
      })),
      unfilledLessons: unfilledLessons.map((lesson) => ({
        id: lesson.id,
        lessonDate: dateToKey(lesson.lessonDate),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        group: lesson.group
      })),
      childrenWithoutActiveSubscription,
      childrenWithDebt,
      notAdmittedChildren,
      pendingCertificates: pendingCertificates.map((record) => ({
        id: record.id,
        markedAt: record.markedAt?.toISOString() ?? null,
        child: record.child,
        lesson: {
          id: record.lesson.id,
          lessonDate: dateToKey(record.lesson.lessonDate),
          startTime: record.lesson.startTime,
          endTime: record.lesson.endTime,
          group: record.lesson.group
        }
      })),
      availableMakeups: availableMakeups.map((makeup) => ({
        id: makeup.id,
        reason: makeup.reason,
        createdAt: makeup.createdAt.toISOString(),
        child: makeup.child,
        group: makeup.group
      })),
      groupsOverCapacity,
      trialsToProcess,
      criticalTasks,
      highTasks
    },
    counts: {
      todayLessons: todayLessons.length,
      unfilledLessons: unfilledLessons.length,
      childrenWithoutActiveSubscription: childrenWithoutActiveSubscription.length,
      childrenWithDebt: childrenWithDebt.length,
      notAdmittedChildren: notAdmittedChildren.length,
      pendingCertificates: pendingCertificates.length,
      availableMakeups: availableMakeups.length,
      groupsOverCapacity: groupsOverCapacity.length,
      trialsToProcess: trialsToProcess.length,
      criticalTasks: criticalTasks.length,
      highTasks: highTasks.length
    },
    tasks: operationalTasks
  };
}

export async function runTaskChecks(currentUser: CurrentUser, input: TaskChecksInput = {}) {
  assertAdmin(currentUser);

  const now = input.now ?? new Date();
  const today = new Date(`${dateToKey(now)}T00:00:00.000Z`);

  return getPrisma().$transaction(async (tx) => {
    const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);
    const closedCount = await autoCloseResolvedTasks(tx, currentUser);
    const missingSubscriptionCount = await createChildrenWithoutActiveSubscriptionTasks(tx, currentUser, adminUserId, today);
    const overCapacityCount = await createOverCapacityTasks(tx, currentUser, adminUserId);

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "TASK_CHECKS_RUN",
        entityType: "Task",
        newValue: {
          closedCount,
          missingSubscriptionCount,
          overCapacityCount,
          now: now.toISOString()
        }
      },
      tx
    );

    return { closedCount, missingSubscriptionCount, overCapacityCount };
  });
}

export async function createTaskIfNotExists(tx: Prisma.TransactionClient, input: CreateTaskIfNotExistsInput) {
  const existing = await tx.task.findFirst({
    where: buildTaskDedupeWhere(input)
  });

  if (existing) {
    return { task: existing, created: false };
  }

  const task = await tx.task.create({
    data: {
      schoolId: input.schoolId,
      type: input.type,
      priority: input.priority,
      assigneeUserId: input.assigneeUserId ?? null,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      childId: input.childId ?? null,
      groupId: input.groupId ?? null
    }
  });

  if (input.priority === "CRITICAL") {
    await writeAuditLog(
      {
        schoolId: input.schoolId,
        actorUserId: input.actorUserId ?? null,
        action: "CRITICAL_TASK_CREATED",
        entityType: "Task",
        entityId: task.id,
        newValue: {
          type: task.type,
          priority: task.priority,
          assigneeUserId: task.assigneeUserId,
          relatedEntityType: task.relatedEntityType,
          relatedEntityId: task.relatedEntityId
        }
      },
      tx
    );
  }

  return { task, created: true };
}

export async function closeTasksByCondition(tx: Prisma.TransactionClient, input: CloseTasksByConditionInput) {
  const tasks = await tx.task.findMany({
    where: {
      schoolId: input.schoolId,
      status: { in: OPEN_TASK_STATUSES },
      ...input.where
    },
    select: { id: true }
  });

  if (tasks.length === 0) {
    return { count: 0 };
  }

  await tx.task.updateMany({
    where: { id: { in: tasks.map((task) => task.id) } },
    data: {
      status: input.status ?? "CLOSED",
      closedAt: new Date(),
      closedByUserId: input.actorUserId ?? null,
      closedComment: input.comment ?? null
    }
  });

  return { count: tasks.length };
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

  const result = await createTaskIfNotExists(tx, {
    schoolId: input.schoolId,
    actorUserId: input.actorUserId,
    type: "GROUP_OVER_CAPACITY",
    priority: "HIGH",
    assigneeUserId: input.actorUserId,
    relatedEntityType: "Group",
    relatedEntityId: input.groupId,
    groupId: input.groupId,
    title: `Группа "${input.groupName}" переполнена`,
    description: `Активных детей: ${input.activeChildrenCount}. Лимит: ${input.capacityLimit}.`
  });

  return result.task;
}

async function assertTaskReferences(tx: Prisma.TransactionClient, schoolId: string, input: CreateManualTaskInput) {
  if (input.assigneeUserId) {
    await tx.user.findFirstOrThrow({ where: { id: input.assigneeUserId, schoolId, status: "ACTIVE" }, select: { id: true } });
  }

  if (input.childId) {
    await tx.child.findFirstOrThrow({ where: { id: input.childId, schoolId }, select: { id: true } });
  }

  if (input.groupId) {
    await tx.trainingGroup.findFirstOrThrow({ where: { id: input.groupId, schoolId }, select: { id: true } });
  }
}

async function findCoachRelatedLessonIds(prisma: ReturnType<typeof getPrisma>, currentUser: CurrentUser) {
  const coach = await prisma.coachProfile.findFirst({
    where: { schoolId: currentUser.schoolId, userId: currentUser.id },
    select: { id: true }
  });

  if (!coach) {
    return [];
  }

  const lessons = await prisma.lesson.findMany({
    where: {
      schoolId: currentUser.schoolId,
      OR: [{ coachId: coach.id }, { substituteCoachId: coach.id }]
    },
    select: { id: true }
  });

  return lessons.map((lesson) => lesson.id);
}

async function autoCloseResolvedTasks(tx: Prisma.TransactionClient, currentUser: CurrentUser) {
  let closedCount = 0;

  const attendanceTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: "ATTENDANCE_NOT_FILLED",
      relatedEntityType: "Lesson",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { id: true, relatedEntityId: true }
  });
  const completedLessons = await tx.lesson.findMany({
    where: { id: { in: attendanceTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] }, status: "ATTENDANCE_COMPLETED" },
    select: { id: true }
  });
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: "ATTENDANCE_NOT_FILLED",
      relatedEntityType: "Lesson",
      relatedEntityId: { in: completedLessons.map((lesson) => lesson.id) }
    },
    comment: "Автозакрытие: табель заполнен."
  })).count;

  const attendanceFollowUpTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: { in: ["CERTIFICATE_PENDING", "SICKNESS_FOLLOW_UP"] },
      relatedEntityType: "AttendanceRecord",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { relatedEntityId: true }
  });
  const finalizedAttendance = await tx.attendanceRecord.findMany({
    where: {
      id: { in: attendanceFollowUpTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] },
      finalStatus: { not: null }
    },
    select: { id: true }
  });
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: { in: ["CERTIFICATE_PENDING", "SICKNESS_FOLLOW_UP"] },
      relatedEntityType: "AttendanceRecord",
      relatedEntityId: { in: finalizedAttendance.map((record) => record.id) }
    },
    comment: "Автозакрытие: отсутствие финализировано."
  })).count;

  const makeupTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: "MAKEUP_NEEDS_ASSIGNMENT",
      relatedEntityType: "MakeupCredit",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { relatedEntityId: true }
  });
  const assignedMakeups = await tx.makeupCredit.findMany({
    where: {
      id: { in: makeupTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] },
      status: { in: ["ASSIGNED", "USED", "REFUNDED", "CANCELLED"] }
    },
    select: { id: true }
  });
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: "MAKEUP_NEEDS_ASSIGNMENT",
      relatedEntityType: "MakeupCredit",
      relatedEntityId: { in: assignedMakeups.map((makeup) => makeup.id) }
    },
    comment: "Автозакрытие: перенос назначен или закрыт."
  })).count;

  const admissionTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: { in: ["CHILD_TOOK_CREDIT_LESSON", "CHILD_NOT_ADMITTED"] },
      relatedEntityType: "Child",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { relatedEntityId: true }
  });
  const admittedChildren = await tx.child.findMany({
    where: {
      id: { in: admissionTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] },
      admissionStatus: "ADMITTED"
    },
    select: { id: true }
  });
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: { in: ["CHILD_TOOK_CREDIT_LESSON", "CHILD_NOT_ADMITTED"] },
      relatedEntityType: "Child",
      relatedEntityId: { in: admittedChildren.map((child) => child.id) }
    },
    comment: "Автозакрытие: допуск восстановлен."
  })).count;

  const groupTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: "GROUP_OVER_CAPACITY",
      relatedEntityType: "Group",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { relatedEntityId: true }
  });
  const groups = await tx.trainingGroup.findMany({
    where: { id: { in: groupTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] } },
    select: { id: true, capacityLimit: true, children: { select: { id: true, status: true } } }
  });
  const resolvedGroups = groups.filter((group) => countActiveChildren(group.children) <= group.capacityLimit);
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: "GROUP_OVER_CAPACITY",
      relatedEntityType: "Group",
      relatedEntityId: { in: resolvedGroups.map((group) => group.id) }
    },
    comment: "Автозакрытие: группа больше не переполнена."
  })).count;

  const trialTasks = await tx.task.findMany({
    where: {
      schoolId: currentUser.schoolId,
      type: "TRIAL_NEEDS_PROCESSING",
      relatedEntityType: "TrialParticipant",
      status: { in: OPEN_TASK_STATUSES }
    },
    select: { relatedEntityId: true }
  });
  const processedTrials = await tx.trialParticipant.findMany({
    where: {
      id: { in: trialTasks.map((task) => task.relatedEntityId).filter(Boolean) as string[] },
      status: { in: ["CONVERTED_TO_ACTIVE", "TRANSFERRED_TO_ADMIN"] }
    },
    select: { id: true }
  });
  closedCount += (await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: "TRIAL_NEEDS_PROCESSING",
      relatedEntityType: "TrialParticipant",
      relatedEntityId: { in: processedTrials.map((trial) => trial.id) }
    },
    comment: "Автозакрытие: пробник обработан."
  })).count;

  return closedCount;
}

async function createChildrenWithoutActiveSubscriptionTasks(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  adminUserId: string | null,
  today: Date
) {
  const children = await tx.child.findMany({
    where: {
      schoolId: currentUser.schoolId,
      status: "ACTIVE",
      currentGroupId: { not: null },
      subscriptions: {
        none: {
          periodStart: { lte: today },
          periodEnd: { gte: today }
        }
      }
    },
    select: {
      id: true,
      fullName: true,
      currentGroupId: true,
      currentGroup: { select: { name: true } }
    }
  });

  let createdCount = 0;

  for (const child of children) {
    const result = await createTaskIfNotExists(tx, {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      type: "CHILD_WITHOUT_ACTIVE_SUBSCRIPTION",
      priority: "CRITICAL",
      assigneeUserId: adminUserId,
      relatedEntityType: "Child",
      relatedEntityId: child.id,
      childId: child.id,
      groupId: child.currentGroupId,
      title: `Нет активного абонемента: ${child.fullName}`,
      description: child.currentGroup?.name ?? null
    });
    createdCount += Number(result.created);
  }

  return createdCount;
}

async function createOverCapacityTasks(tx: Prisma.TransactionClient, currentUser: CurrentUser, adminUserId: string | null) {
  const groups = await tx.trainingGroup.findMany({
    where: { schoolId: currentUser.schoolId, status: "ACTIVE" },
    select: { id: true, name: true, capacityLimit: true, children: { select: { id: true, status: true } } }
  });
  let createdCount = 0;

  for (const group of groups) {
    const activeChildrenCount = countActiveChildren(group.children);

    if (activeChildrenCount <= group.capacityLimit) {
      continue;
    }

    const result = await createTaskIfNotExists(tx, {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      type: "GROUP_OVER_CAPACITY",
      priority: "HIGH",
      assigneeUserId: adminUserId,
      relatedEntityType: "Group",
      relatedEntityId: group.id,
      groupId: group.id,
      title: `Группа "${group.name}" переполнена`,
      description: `Активных детей: ${activeChildrenCount}. Лимит: ${group.capacityLimit}.`
    });
    createdCount += Number(result.created);
  }

  return createdCount;
}

function assertCanCloseTask(currentUser: CurrentUser, task: Pick<TaskRecord, "assigneeUserId">) {
  if (hasRole(currentUser, ADMIN_ROLES)) {
    return;
  }

  if (currentUser.role === "COACH" && task.assigneeUserId === currentUser.id) {
    return;
  }

  throw new Error("Недостаточно прав для закрытия задачи.");
}

async function findAdminAssigneeUserId(tx: Prisma.TransactionClient, schoolId: string) {
  const admin = await tx.user.findFirst({
    where: {
      schoolId,
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE"
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });

  return admin?.id ?? null;
}

function endOfPacificDay(date: Date) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

  return new Date(`${key}T23:59:59.999Z`);
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}
