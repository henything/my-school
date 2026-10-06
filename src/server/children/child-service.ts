import { hasRole } from "@/server/rbac/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { ensureCurrentMonthSubscriptionForChild } from "@/server/billing/billing-service";
import { getPrisma } from "@/server/db/prisma";
import { countActiveChildren } from "@/server/groups/capacity";
import { serializeParent } from "@/server/parents/parent-service";
import { ensureGroupOverCapacityTask } from "@/server/tasks/task-service";
import { todayInMoscow, weekdayForDate } from "./attendance-plan";
import type { CreateChildEnrollmentInput, CreateChildInput, SetChildAttendancePlanInput, UpdateChildInput } from "./schemas";

const childInclude = {
  attendancePlans: { orderBy: { effectiveFrom: "desc" as const } },
  parent: { select: { id: true, fullName: true, phone: true, vkProfileUrl: true } },
  currentGroup: {
    select: {
      id: true,
      name: true,
      capacityLimit: true,
      branch: { select: { id: true, name: true, address: true } },
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
  attendancePlans: Array<{ effectiveFrom: Date; weekday: number | null }>;
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
    branch: { id: string; name: string; address: string | null };
    mainCoach: { id: string; userId: string; user: { displayName: string } };
    children: Array<{ id: string; status: string }>;
  } | null;
};

export function requiresChildStatusChangeComment(previousStatus: string, nextStatus: string | undefined) {
  return Boolean(nextStatus && nextStatus !== previousStatus && ["LEFT", "ARCHIVED"].includes(nextStatus));
}

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
    attendancePlans: child.attendancePlans.map((plan) => ({
      effectiveFrom: plan.effectiveFrom.toISOString().slice(0, 10),
      weekday: plan.weekday
    })),
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

    if (input.attendanceWeekday != null) {
      if (!input.currentGroupId) throw new Error("Для одного занятия в неделю сначала выберите группу.");
      await assertGroupHasWeekday(tx, currentUser.schoolId, input.currentGroupId, input.attendanceWeekday, todayInMoscow());
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
        admissionStatus: input.admissionStatus,
        attendancePlans: input.attendanceWeekday == null ? undefined : {
          create: { effectiveFrom: todayInMoscow(), weekday: input.attendanceWeekday }
        }
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

    await ensureCurrentMonthSubscriptionForChild(tx, currentUser, child.id, child.createdAt);

    const refreshedChild = await tx.child.findUniqueOrThrow({
      where: { id: child.id },
      include: childInclude
    });

    return serializeChild(refreshedChild);
  });
}

export async function createChildEnrollment(currentUser: CurrentUser, input: CreateChildEnrollmentInput) {
  return getPrisma().$transaction(async (tx) => {
    let parentId = input.parentId ?? null;
    let createdParent: ReturnType<typeof serializeParent> | null = null;
    const sharedComment = input.comment ?? null;

    if (parentId) {
      await tx.parent.findFirstOrThrow({
        where: {
          id: parentId,
          schoolId: currentUser.schoolId
        }
      });
    } else if (input.parentFullName || input.parentPhone || input.parentVkProfileUrl || input.parentComment) {
      const parent = await tx.parent.create({
        data: {
          schoolId: currentUser.schoolId,
          fullName: input.parentFullName,
          phone: input.parentPhone,
          vkProfileUrl: input.parentVkProfileUrl,
          comment: input.parentComment ?? sharedComment
        },
        include: { _count: { select: { children: true } } }
      });

      createdParent = serializeParent(parent);
      parentId = parent.id;

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "PARENT_CREATED",
          entityType: "Parent",
          entityId: parent.id,
          newValue: createdParent
        },
        tx
      );
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

    if (input.attendanceWeekday != null) {
      if (!input.currentGroupId) throw new Error("Для одного занятия в неделю сначала выберите группу.");
      await assertGroupHasWeekday(tx, currentUser.schoolId, input.currentGroupId, input.attendanceWeekday, todayInMoscow());
    }

    const child = await tx.child.create({
      data: {
        schoolId: currentUser.schoolId,
        parentId,
        currentGroupId: input.currentGroupId,
        fullName: input.fullName,
        birthDate: input.birthDate,
        status: input.status,
        medicalNotes: input.medicalNotes,
        coachComment: input.coachComment ?? sharedComment,
        adminComment: input.adminComment ?? sharedComment,
        admissionStatus: input.admissionStatus,
        attendancePlans: input.attendanceWeekday == null ? undefined : {
          create: { effectiveFrom: todayInMoscow(), weekday: input.attendanceWeekday }
        }
      },
      include: childInclude
    });

    const serializedChild = serializeChild(child);

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "CHILD_CREATED",
        entityType: "Child",
        entityId: child.id,
        newValue: serializedChild
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

    await ensureCurrentMonthSubscriptionForChild(tx, currentUser, child.id, child.createdAt);

    const refreshedChild = await tx.child.findUniqueOrThrow({
      where: { id: child.id },
      include: childInclude
    });

    return {
      child: serializeChild(refreshedChild),
      parent: createdParent
    };
  });
}

export async function updateChild(currentUser: CurrentUser, childId: string, input: UpdateChildInput) {
  return getPrisma().$transaction(async (tx) => {
    const { statusChangeComment, ...childUpdateData } = input;
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
        childUpdateData.fullName !== undefined ||
        childUpdateData.parentId !== undefined ||
        childUpdateData.currentGroupId !== undefined ||
        childUpdateData.birthDate !== undefined ||
        childUpdateData.status !== undefined ||
        childUpdateData.adminComment !== undefined ||
        childUpdateData.admissionStatus !== undefined ||
        statusChangeComment !== undefined;

      if (!coachCanAccess || attemptedAdminOnlyChange) {
        throw new Error("Недостаточно прав для изменения карточки ребёнка.");
      }
    }

    if (!isAdmin && !isCoach) {
      throw new Error("Недостаточно прав для изменения карточки ребёнка.");
    }

    if (requiresChildStatusChangeComment(existing.status, childUpdateData.status) && !statusChangeComment) {
      throw new Error("Для статуса LEFT или ARCHIVED нужен комментарий.");
    }

    if (childUpdateData.parentId) {
      await tx.parent.findFirstOrThrow({
        where: {
          id: childUpdateData.parentId,
          schoolId: currentUser.schoolId
        }
      });
    }

    if (childUpdateData.currentGroupId) {
      await tx.trainingGroup.findFirstOrThrow({
        where: {
          id: childUpdateData.currentGroupId,
          schoolId: currentUser.schoolId,
          status: { not: "ARCHIVED" }
        }
      });
    }

    if (childUpdateData.currentGroupId && childUpdateData.currentGroupId !== existing.currentGroup?.id) {
      const today = todayInMoscow();
      const currentPlan = existing.attendancePlans.find((plan) => plan.effectiveFrom <= today);
      const relevantPlans = [currentPlan, ...existing.attendancePlans.filter((plan) => plan.effectiveFrom > today)].filter(
        (plan) => plan !== undefined
      );
      for (const plan of relevantPlans) {
        if (plan.weekday != null) {
          await assertGroupHasWeekday(tx, currentUser.schoolId, childUpdateData.currentGroupId, plan.weekday, plan.effectiveFrom);
        }
      }
    }

    const updated = await tx.child.update({
      where: { id: existing.id },
      data: childUpdateData,
      include: childInclude
    });

    if (existing.status !== updated.status) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_STATUS_UPDATED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: { status: existing.status },
          newValue: { status: updated.status },
          comment: statusChangeComment
        },
        tx
      );
    }

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

    if (existing.admissionStatus !== updated.admissionStatus) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_ADMISSION_STATUS_UPDATED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: { admissionStatus: existing.admissionStatus },
          newValue: { admissionStatus: updated.admissionStatus }
        },
        tx
      );
    }

    if (existing.coachComment !== updated.coachComment) {
      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_COACH_COMMENT_UPDATED",
          entityType: "Child",
          entityId: updated.id,
          oldValue: { coachComment: existing.coachComment },
          newValue: { coachComment: updated.coachComment }
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

    const subscriptionAnchorDate = new Date();
    if (existing.currentGroup?.id !== updated.currentGroup?.id) {
      await ensureCurrentMonthSubscriptionForChild(tx, currentUser, updated.id, subscriptionAnchorDate);
    }

    const refreshedUpdated = await tx.child.findUniqueOrThrow({
      where: { id: updated.id },
      include: childInclude
    });

    const serialized = serializeChild(refreshedUpdated);

    if (isCoach && !isAdmin) {
      const { cachedLessonBalance, cachedMakeupBalance, ...coachVisibleChild } = serialized;
      void cachedLessonBalance;
      void cachedMakeupBalance;
      return coachVisibleChild;
    }

    return serialized;
  });
}

export async function setChildAttendancePlan(currentUser: CurrentUser, childId: string, input: SetChildAttendancePlanInput) {
  if (!hasRole(currentUser, ["SUPER_ADMIN", "ADMIN"])) {
    throw new Error("Недостаточно прав для изменения дней посещения.");
  }

  return getPrisma().$transaction(async (tx) => {
    const child = await tx.child.findFirstOrThrow({
      where: { id: childId, schoolId: currentUser.schoolId },
      select: { id: true, currentGroupId: true, attendancePlans: { orderBy: { effectiveFrom: "desc" } } }
    });
    if (!child.currentGroupId) throw new Error("Сначала назначьте ребёнку группу.");
    if (input.effectiveFrom < todayInMoscow()) throw new Error("Новый график нельзя применять задним числом.");

    const alreadyCreatedSubscription = await tx.subscription.findFirst({
      where: { schoolId: currentUser.schoolId, childId, periodEnd: { gte: todayInMoscow() } },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true }
    });
    if (alreadyCreatedSubscription && input.effectiveFrom.getUTCDate() !== 1) {
      throw new Error("При уже созданном абонементе новый график начинается с первого числа следующего месяца.");
    }
    if (alreadyCreatedSubscription && input.effectiveFrom <= alreadyCreatedSubscription.periodEnd) {
      throw new Error(`У ребёнка уже есть абонемент до ${alreadyCreatedSubscription.periodEnd.toISOString().slice(0, 10)}. Выберите дату после его окончания.`);
    }

    if (input.weekday != null) {
      await assertGroupHasWeekday(tx, currentUser.schoolId, child.currentGroupId, input.weekday, input.effectiveFrom);
    }

    const existingForDate = child.attendancePlans.find((plan) => plan.effectiveFrom.getTime() === input.effectiveFrom.getTime());
    const plan = await tx.childAttendancePlan.upsert({
      where: { childId_effectiveFrom: { childId, effectiveFrom: input.effectiveFrom } },
      create: { childId, effectiveFrom: input.effectiveFrom, weekday: input.weekday },
      update: { weekday: input.weekday }
    });
    await writeAuditLog({
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "CHILD_ATTENDANCE_PLAN_UPDATED",
      entityType: "Child",
      entityId: childId,
      oldValue: existingForDate ? { effectiveFrom: existingForDate.effectiveFrom, weekday: existingForDate.weekday } : null,
      newValue: { effectiveFrom: plan.effectiveFrom, weekday: plan.weekday }
    }, tx);
    return { effectiveFrom: plan.effectiveFrom.toISOString().slice(0, 10), weekday: plan.weekday };
  });
}

async function assertGroupHasWeekday(tx: Prisma.TransactionClient, schoolId: string, groupId: string, weekday: number, from: Date) {
  const templates = await tx.scheduleTemplate.findMany({
    where: { schoolId, groupId, status: "ACTIVE", weekday }, select: { id: true }
  });
  if (templates.length > 1) throw new Error("У группы несколько занятий в этот день. Нельзя настроить режим раз в неделю.");
  const lessons = await tx.lesson.findMany({
    where: { schoolId, groupId, lessonDate: { gte: from }, status: { not: "CANCELLED" } },
    select: { lessonDate: true }
  });
  const matching = lessons.filter((lesson) => weekdayForDate(lesson.lessonDate) === weekday);
  if (!matching.length && templates.length === 0) {
    throw new Error("В выбранной группе нет занятий в этот день недели.");
  }
  if (new Set(matching.map((lesson) => lesson.lessonDate.toISOString().slice(0, 10))).size !== matching.length) {
    throw new Error("У группы несколько занятий в этот день. Нельзя настроить режим раз в неделю.");
  }
}
