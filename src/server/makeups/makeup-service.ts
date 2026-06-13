import type { AdminFinalAttendanceStatus, MakeupReason, MakeupStatus, TaskStatus, TaskType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { applyAttendanceBalanceEffect } from "@/server/billing/billing-service";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import type {
  AssignMakeupInput,
  CloseMakeupInput,
  CreateGroupEventInput,
  CreateVacationInput,
  FinalizeAttendanceInput,
  SicknessFollowUpJobInput
} from "./schemas";
import {
  assertCanCloseMakeup,
  assertSameGroupMakeupAssignment,
  assertVacationIsNotBackdated,
  finalStatusBalanceEffectStatus,
  finalStatusStoredAttendanceStatus,
  makeupReasonForFinalStatus,
  makeupReasonForGroupEvent,
  transactionTypeForMakeupReason
} from "./rules";

const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

const makeupInclude = {
  child: {
    select: {
      id: true,
      fullName: true,
      cachedMakeupBalance: true,
      currentGroup: { select: { id: true, name: true } }
    }
  },
  group: { select: { id: true, name: true } },
  sourceLesson: { select: { id: true, lessonDate: true, startTime: true, endTime: true } },
  assignedLesson: { select: { id: true, lessonDate: true, startTime: true, endTime: true } },
  sourceAttendanceRecord: { select: { id: true, status: true, finalStatus: true } },
  groupEvent: { select: { id: true, reason: true, periodStart: true, periodEnd: true } },
  createdBy: { select: { id: true, displayName: true, login: true } }
} as const;

const pendingSicknessInclude = {
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
} as const;

const groupEventInclude = {
  group: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true, login: true } },
  makeupCredits: { select: { id: true } }
} as const;

type MakeupRecord = Prisma.MakeupCreditGetPayload<{ include: typeof makeupInclude }>;
type PendingSicknessRecord = Prisma.AttendanceRecordGetPayload<{ include: typeof pendingSicknessInclude }>;
type GroupEventRecord = Prisma.GroupEventGetPayload<{ include: typeof groupEventInclude }>;

type LessonForBalance = {
  id: string;
  schoolId: string;
  lessonDate: Date;
  startTime: string;
  endTime: string;
  group: { id: string; name: string; children: Array<{ id: string; fullName: string }> };
};

export function serializeMakeup(makeup: MakeupRecord) {
  return {
    id: makeup.id,
    childId: makeup.childId,
    child: makeup.child,
    group: makeup.group,
    reason: makeup.reason,
    status: makeup.status,
    sourceLesson: makeup.sourceLesson ? serializeLessonRef(makeup.sourceLesson) : null,
    assignedLesson: makeup.assignedLesson ? serializeLessonRef(makeup.assignedLesson) : null,
    sourceAttendanceRecord: makeup.sourceAttendanceRecord,
    groupEvent: makeup.groupEvent
      ? {
          id: makeup.groupEvent.id,
          reason: makeup.groupEvent.reason,
          periodStart: dateToKey(makeup.groupEvent.periodStart),
          periodEnd: dateToKey(makeup.groupEvent.periodEnd)
        }
      : null,
    assignedDate: makeup.assignedDate ? dateToKey(makeup.assignedDate) : null,
    comment: makeup.comment,
    createdBy: makeup.createdBy,
    createdAt: makeup.createdAt.toISOString(),
    updatedAt: makeup.updatedAt.toISOString(),
    usedAt: makeup.usedAt?.toISOString() ?? null,
    refundedAt: makeup.refundedAt?.toISOString() ?? null,
    cancelledAt: makeup.cancelledAt?.toISOString() ?? null
  };
}

export function serializePendingSickness(record: PendingSicknessRecord) {
  return {
    id: record.id,
    status: record.status,
    finalStatus: record.finalStatus,
    comment: record.comment,
    markedAt: record.markedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    child: record.child,
    lesson: {
      id: record.lesson.id,
      lessonDate: dateToKey(record.lesson.lessonDate),
      startTime: record.lesson.startTime,
      endTime: record.lesson.endTime,
      group: record.lesson.group
    }
  };
}

export function serializeGroupEvent(event: GroupEventRecord) {
  return {
    id: event.id,
    group: event.group,
    reason: event.reason,
    actionType: event.actionType,
    periodStart: dateToKey(event.periodStart),
    periodEnd: dateToKey(event.periodEnd),
    comment: event.comment,
    createdBy: event.createdBy,
    makeupCount: event.makeupCredits.length,
    createdAt: event.createdAt.toISOString()
  };
}

export async function listMakeups(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const makeups = await getPrisma().makeupCredit.findMany({
    where: { schoolId: currentUser.schoolId },
    include: makeupInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return makeups.map(serializeMakeup);
}

export async function listPendingSickness(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const records = await getPrisma().attendanceRecord.findMany({
    where: {
      status: "ABSENT_SICK_PENDING",
      finalStatus: null,
      lesson: { schoolId: currentUser.schoolId }
    },
    include: pendingSicknessInclude,
    orderBy: [{ markedAt: "asc" }, { createdAt: "asc" }]
  });

  return records.map(serializePendingSickness);
}

export async function listGroupEvents(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const events = await getPrisma().groupEvent.findMany({
    where: { schoolId: currentUser.schoolId },
    include: groupEventInclude,
    orderBy: { createdAt: "desc" },
    take: 40
  });

  return events.map(serializeGroupEvent);
}

export async function finalizeAttendance(currentUser: CurrentUser, attendanceRecordId: string, input: FinalizeAttendanceInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findFirstOrThrow({
      where: {
        id: attendanceRecordId,
        lesson: { schoolId: currentUser.schoolId }
      },
      include: {
        child: { select: { id: true, fullName: true, cachedMakeupBalance: true } },
        lesson: {
          select: {
            id: true,
            schoolId: true,
            lessonDate: true,
            startTime: true,
            endTime: true,
            groupId: true,
            group: {
              select: {
                id: true,
                name: true,
                children: { where: { status: "ACTIVE" }, select: { id: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    if (input.finalStatus === "ABSENT_SICK_CONFIRMED" && existing.status !== "ABSENT_SICK_PENDING") {
      throw new Error("Подтвердить болезнь можно только для статуса ожидания справки.");
    }

    const oldValue = {
      status: existing.status,
      finalStatus: existing.finalStatus,
      comment: existing.comment
    };
    const balanceEffectStatus = finalStatusBalanceEffectStatus(input.finalStatus);
    const storedStatus = finalStatusStoredAttendanceStatus(input.finalStatus, existing.status);
    const updated = await tx.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        status: storedStatus,
        finalStatus: input.finalStatus,
        finalizedByUserId: currentUser.id,
        finalizedAt: new Date(),
        comment: input.comment ?? existing.comment
      },
      include: pendingSicknessInclude
    });

    await applyAttendanceBalanceEffect(tx, currentUser, existing.lesson, {
      id: existing.id,
      childId: existing.childId,
      status: balanceEffectStatus
    });

    const reason = makeupReasonForFinalStatus(input.finalStatus);
    const makeup = reason
      ? await createMakeupCredit(tx, currentUser, {
          childId: existing.childId,
          groupId: existing.lesson.groupId,
          sourceLessonId: existing.lessonId,
          sourceAttendanceRecordId: existing.id,
          reason,
          comment: input.comment
        })
      : null;

    await closeRelatedTasks(tx, currentUser, ["CERTIFICATE_PENDING", "SICKNESS_FOLLOW_UP"], "AttendanceRecord", existing.id);
    await closeRelatedTasks(tx, currentUser, ["ABSENCE_NEEDS_FINALIZATION"], "Child", existing.childId);

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "ATTENDANCE_FINALIZED",
        entityType: "AttendanceRecord",
        entityId: existing.id,
        oldValue,
        newValue: {
          status: updated.status,
          finalStatus: updated.finalStatus,
          comment: updated.comment,
          makeupCreditId: makeup?.id ?? null
        },
        comment: input.comment
      },
      tx
    );

    return {
      attendanceRecord: serializePendingSickness(updated),
      makeup: makeup ? serializeMakeup(await loadMakeup(tx, makeup.id)) : null
    };
  });
}

export async function createVacation(currentUser: CurrentUser, childId: string, input: CreateVacationInput) {
  assertAdmin(currentUser);
  assertVacationIsNotBackdated(input.periodStart, input.today ?? new Date());

  return getPrisma().$transaction(async (tx) => {
    const child = await tx.child.findFirstOrThrow({
      where: {
        id: childId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" },
        currentGroupId: { not: null }
      },
      select: {
        id: true,
        fullName: true,
        currentGroupId: true,
        currentGroup: { select: { id: true, name: true } }
      }
    });

    if (!child.currentGroupId) {
      throw new Error("У ребёнка нет активной группы для оформления отпуска.");
    }

    const lessons = await tx.lesson.findMany({
      where: {
        schoolId: currentUser.schoolId,
        groupId: child.currentGroupId,
        lessonDate: { gte: input.periodStart, lte: input.periodEnd },
        status: { not: "CANCELLED" }
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            children: { where: { status: "ACTIVE" }, select: { id: true, fullName: true } }
          }
        }
      },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }]
    });

    const makeups: MakeupRecord[] = [];

    for (const lesson of lessons) {
      const attendance = await upsertFinalAttendanceRecord(tx, currentUser, lesson, child.id, "ABSENT_VACATION_APPROVED", input.comment);
      await applyAttendanceBalanceEffect(tx, currentUser, lesson, {
        id: attendance.id,
        childId: child.id,
        status: "NOT_MARKED"
      });
      const makeup = await createMakeupCredit(tx, currentUser, {
        childId: child.id,
        groupId: child.currentGroupId,
        sourceLessonId: lesson.id,
        sourceAttendanceRecordId: attendance.id,
        reason: "VACATION",
        comment: input.comment
      });
      makeups.push(await loadMakeup(tx, makeup.id));
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "VACATION_APPROVED",
        entityType: "Child",
        entityId: child.id,
        newValue: {
          childId: child.id,
          groupId: child.currentGroupId,
          periodStart: dateToKey(input.periodStart),
          periodEnd: dateToKey(input.periodEnd),
          lessonCount: lessons.length,
          makeupCount: makeups.length
        },
        comment: input.comment
      },
      tx
    );

    return {
      child: {
        id: child.id,
        fullName: child.fullName,
        group: child.currentGroup
      },
      lessonCount: lessons.length,
      makeupCount: makeups.length,
      makeups: makeups.map(serializeMakeup)
    };
  });
}

export async function createGroupEvent(currentUser: CurrentUser, input: CreateGroupEventInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const group = await tx.trainingGroup.findFirstOrThrow({
      where: {
        id: input.groupId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        name: true,
        children: { where: { status: "ACTIVE" }, select: { id: true, fullName: true } }
      }
    });

    const lessons = await tx.lesson.findMany({
      where: {
        schoolId: currentUser.schoolId,
        groupId: group.id,
        lessonDate: { gte: input.periodStart, lte: input.periodEnd },
        status: { not: "CANCELLED" }
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            children: { where: { status: "ACTIVE" }, select: { id: true, fullName: true } }
          }
        }
      },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }]
    });

    const event = await tx.groupEvent.create({
      data: {
        schoolId: currentUser.schoolId,
        groupId: group.id,
        reason: input.reason,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        createdByUserId: currentUser.id,
        comment: input.comment
      }
    });

    const finalStatus: AdminFinalAttendanceStatus = input.reason === "QUARANTINE" ? "ABSENT_QUARANTINE" : "ABSENT_EVENT";
    const makeupReason = makeupReasonForGroupEvent(input.reason);
    let makeupCount = 0;

    for (const lesson of lessons) {
      await tx.lesson.update({
        where: { id: lesson.id },
        data: {
          status: "CANCELLED",
          changeReason: input.reason,
          changeComment: input.comment
        }
      });

      for (const child of group.children) {
        const attendance = await upsertFinalAttendanceRecord(tx, currentUser, lesson, child.id, finalStatus, input.comment);
        await applyAttendanceBalanceEffect(tx, currentUser, lesson, {
          id: attendance.id,
          childId: child.id,
          status: "NOT_MARKED"
        });
        await createMakeupCredit(tx, currentUser, {
          childId: child.id,
          groupId: group.id,
          sourceLessonId: lesson.id,
          sourceAttendanceRecordId: attendance.id,
          groupEventId: event.id,
          reason: makeupReason,
          comment: input.comment
        });
        makeupCount += 1;
      }
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "GROUP_EVENT_APPLIED",
        entityType: "GroupEvent",
        entityId: event.id,
        newValue: {
          groupId: group.id,
          reason: input.reason,
          periodStart: dateToKey(input.periodStart),
          periodEnd: dateToKey(input.periodEnd),
          lessonCount: lessons.length,
          childCount: group.children.length,
          makeupCount
        },
        comment: input.comment
      },
      tx
    );

    return {
      event: serializeGroupEvent(await loadGroupEvent(tx, event.id)),
      lessonCount: lessons.length,
      childCount: group.children.length,
      makeupCount
    };
  });
}

export async function assignMakeup(currentUser: CurrentUser, makeupId: string, input: AssignMakeupInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const makeup = await tx.makeupCredit.findFirstOrThrow({
      where: {
        id: makeupId,
        schoolId: currentUser.schoolId
      },
      include: { child: { select: { fullName: true } }, group: { select: { id: true, name: true } } }
    });

    if (makeup.status !== "AVAILABLE") {
      throw new Error("Назначить можно только доступный перенос.");
    }

    const lesson = await tx.lesson.findFirstOrThrow({
      where: {
        id: input.assignedLessonId,
        schoolId: currentUser.schoolId,
        status: { not: "CANCELLED" }
      },
      select: { id: true, groupId: true, lessonDate: true, startTime: true, endTime: true }
    });

    assertSameGroupMakeupAssignment(makeup.groupId, lesson.groupId);

    const updated = await tx.makeupCredit.update({
      where: { id: makeup.id },
      data: {
        status: "ASSIGNED",
        assignedLessonId: lesson.id,
        assignedDate: lesson.lessonDate,
        comment: input.comment ?? makeup.comment
      }
    });

    await closeRelatedTasks(tx, currentUser, ["MAKEUP_NEEDS_ASSIGNMENT"], "MakeupCredit", makeup.id);
    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "MAKEUP_ASSIGNED",
        entityType: "MakeupCredit",
        entityId: makeup.id,
        oldValue: {
          status: makeup.status,
          assignedLessonId: makeup.assignedLessonId,
          assignedDate: makeup.assignedDate ? dateToKey(makeup.assignedDate) : null
        },
        newValue: {
          status: updated.status,
          assignedLessonId: updated.assignedLessonId,
          assignedDate: updated.assignedDate ? dateToKey(updated.assignedDate) : null
        },
        comment: input.comment
      },
      tx
    );

    return serializeMakeup(await loadMakeup(tx, updated.id));
  });
}

export async function closeMakeup(currentUser: CurrentUser, makeupId: string, input: CloseMakeupInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const makeup = await tx.makeupCredit.findFirstOrThrow({
      where: {
        id: makeupId,
        schoolId: currentUser.schoolId
      },
      select: {
        id: true,
        childId: true,
        status: true,
        assignedLessonId: true,
        comment: true
      }
    });

    assertCanCloseMakeup(makeup.status, input.status, Boolean(makeup.assignedLessonId));

    const now = new Date();
    const timestampData =
      input.status === "USED"
        ? { usedAt: now }
        : input.status === "REFUNDED"
          ? { refundedAt: now }
          : { cancelledAt: now };

    await settleMakeupBalance(tx, currentUser, makeup.id, makeup.childId, input.status);

    const updated = await tx.makeupCredit.update({
      where: { id: makeup.id },
      data: {
        status: input.status,
        comment: input.comment ?? makeup.comment,
        ...timestampData
      }
    });

    await closeRelatedTasks(tx, currentUser, ["MAKEUP_NEEDS_ASSIGNMENT"], "MakeupCredit", makeup.id);
    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "MAKEUP_CLOSED",
        entityType: "MakeupCredit",
        entityId: makeup.id,
        oldValue: { status: makeup.status },
        newValue: { status: updated.status },
        comment: input.comment
      },
      tx
    );

    return serializeMakeup(await loadMakeup(tx, updated.id));
  });
}

export async function runSicknessFollowUpCheck(currentUser: CurrentUser, input: SicknessFollowUpJobInput = {}) {
  assertAdmin(currentUser);

  const now = input.now ?? new Date();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);

  return getPrisma().$transaction(async (tx) => {
    const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);
    const records = await tx.attendanceRecord.findMany({
      where: {
        status: "ABSENT_SICK_PENDING",
        finalStatus: null,
        lesson: { schoolId: currentUser.schoolId },
        OR: [{ markedAt: { lte: cutoff } }, { markedAt: null, createdAt: { lte: cutoff } }]
      },
      include: pendingSicknessInclude
    });

    let createdTaskCount = 0;

    for (const record of records) {
      const task = await ensureTask(tx, {
        schoolId: currentUser.schoolId,
        type: "SICKNESS_FOLLOW_UP",
        priority: "HIGH",
        assigneeUserId: adminUserId,
        relatedEntityType: "AttendanceRecord",
        relatedEntityId: record.id,
        childId: record.childId,
        groupId: record.lesson.group.id,
        title: `Проверить болезнь: ${record.child.fullName}`,
        description: `${record.lesson.group.name}, ${dateToKey(record.lesson.lessonDate)} ${record.lesson.startTime}-${record.lesson.endTime}`
      });
      createdTaskCount += Number(task.created);
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "SICKNESS_FOLLOW_UP_CHECK_RUN",
        entityType: "AttendanceRecord",
        newValue: {
          checkedCount: records.length,
          createdTaskCount,
          now: now.toISOString()
        }
      },
      tx
    );

    return { checkedCount: records.length, createdTaskCount };
  });
}

async function upsertFinalAttendanceRecord(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonForBalance,
  childId: string,
  finalStatus: AdminFinalAttendanceStatus,
  comment: string | null | undefined
) {
  return tx.attendanceRecord.upsert({
    where: {
      lessonId_childId: {
        lessonId: lesson.id,
        childId
      }
    },
    create: {
      lessonId: lesson.id,
      childId,
      status: "NOT_MARKED",
      finalStatus,
      finalizedByUserId: currentUser.id,
      finalizedAt: new Date(),
      comment: comment ?? null
    },
    update: {
      status: "NOT_MARKED",
      finalStatus,
      finalizedByUserId: currentUser.id,
      finalizedAt: new Date(),
      comment: comment ?? undefined
    }
  });
}

async function createMakeupCredit(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  input: {
    childId: string;
    groupId: string;
    sourceLessonId?: string | null;
    sourceAttendanceRecordId?: string | null;
    groupEventId?: string | null;
    reason: MakeupReason;
    comment?: string | null;
  }
) {
  const existing = await tx.makeupCredit.findFirst({
    where: {
      schoolId: currentUser.schoolId,
      childId: input.childId,
      reason: input.reason,
      ...(input.sourceAttendanceRecordId ? { sourceAttendanceRecordId: input.sourceAttendanceRecordId } : {}),
      ...(input.sourceLessonId ? { sourceLessonId: input.sourceLessonId } : {})
    }
  });

  if (existing) {
    return existing;
  }

  const makeup = await tx.makeupCredit.create({
    data: {
      schoolId: currentUser.schoolId,
      childId: input.childId,
      groupId: input.groupId,
      sourceLessonId: input.sourceLessonId ?? null,
      sourceAttendanceRecordId: input.sourceAttendanceRecordId ?? null,
      groupEventId: input.groupEventId ?? null,
      reason: input.reason,
      createdByUserId: currentUser.id,
      comment: input.comment ?? null
    }
  });

  const transaction = await tx.lessonBalanceTransaction.create({
    data: {
      schoolId: currentUser.schoolId,
      childId: input.childId,
      lessonId: input.sourceLessonId ?? null,
      attendanceRecordId: input.sourceAttendanceRecordId ?? null,
      makeupCreditId: makeup.id,
      type: transactionTypeForMakeupReason(input.reason),
      balanceType: "MAKEUP_BALANCE",
      amount: 1,
      reason: input.reason,
      createdByUserId: currentUser.id,
      comment: input.comment ?? "Создан перенос"
    }
  });

  await tx.child.update({
    where: { id: input.childId },
    data: { cachedMakeupBalance: { increment: 1 } }
  });

  await ensureMakeupAssignmentTask(tx, currentUser, makeup.id, input.childId, input.groupId);
  await writeAuditLog(
    {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "MAKEUP_CREATED",
      entityType: "MakeupCredit",
      entityId: makeup.id,
      newValue: {
        childId: input.childId,
        groupId: input.groupId,
        sourceLessonId: input.sourceLessonId ?? null,
        sourceAttendanceRecordId: input.sourceAttendanceRecordId ?? null,
        groupEventId: input.groupEventId ?? null,
        reason: input.reason,
        transactionId: transaction.id
      },
      comment: input.comment
    },
    tx
  );

  return makeup;
}

async function settleMakeupBalance(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  makeupCreditId: string,
  childId: string,
  nextStatus: MakeupStatus
) {
  const aggregate = await tx.lessonBalanceTransaction.aggregate({
    _sum: { amount: true },
    where: {
      makeupCreditId,
      balanceType: "MAKEUP_BALANCE"
    }
  });
  const currentNet = aggregate._sum.amount ?? 0;

  if (currentNet <= 0) {
    return null;
  }

  const transaction = await tx.lessonBalanceTransaction.create({
    data: {
      schoolId: currentUser.schoolId,
      childId,
      makeupCreditId,
      type: "MAKEUP_USED",
      balanceType: "MAKEUP_BALANCE",
      amount: -currentNet,
      reason: nextStatus,
      createdByUserId: currentUser.id,
      comment: `Перенос закрыт: ${nextStatus}`
    }
  });

  await tx.child.update({
    where: { id: childId },
    data: { cachedMakeupBalance: { decrement: currentNet } }
  });

  await writeAuditLog(
    {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "MAKEUP_BALANCE_TRANSACTION_CREATED",
      entityType: "LessonBalanceTransaction",
      entityId: transaction.id,
      newValue: {
        makeupCreditId,
        childId,
        amount: -currentNet,
        status: nextStatus
      }
    },
    tx
  );

  return transaction;
}

async function ensureMakeupAssignmentTask(tx: Prisma.TransactionClient, currentUser: CurrentUser, makeupId: string, childId: string, groupId: string) {
  const [child, group, adminUserId] = await Promise.all([
    tx.child.findUnique({ where: { id: childId }, select: { fullName: true } }),
    tx.trainingGroup.findUnique({ where: { id: groupId }, select: { name: true } }),
    findAdminAssigneeUserId(tx, currentUser.schoolId)
  ]);

  return ensureTask(tx, {
    schoolId: currentUser.schoolId,
    type: "MAKEUP_NEEDS_ASSIGNMENT",
    priority: "HIGH",
    assigneeUserId: adminUserId,
    relatedEntityType: "MakeupCredit",
    relatedEntityId: makeupId,
    childId,
    groupId,
    title: `Назначить перенос: ${child?.fullName ?? "ребёнок"}`,
    description: group?.name ?? null
  });
}

async function ensureTask(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    type: TaskType;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    assigneeUserId: string | null;
    relatedEntityType: string;
    relatedEntityId: string;
    childId?: string | null;
    groupId?: string | null;
    title: string;
    description?: string | null;
  }
) {
  const existing = await tx.task.findFirst({
    where: {
      schoolId: input.schoolId,
      type: input.type,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      status: { in: OPEN_TASK_STATUSES }
    }
  });

  if (existing) {
    return { task: existing, created: false };
  }

  const task = await tx.task.create({
    data: {
      schoolId: input.schoolId,
      type: input.type,
      priority: input.priority,
      assigneeUserId: input.assigneeUserId,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      childId: input.childId ?? null,
      groupId: input.groupId ?? null,
      title: input.title,
      description: input.description ?? null
    }
  });

  return { task, created: true };
}

async function closeRelatedTasks(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  types: TaskType[],
  relatedEntityType: string,
  relatedEntityId: string
) {
  return tx.task.updateMany({
    where: {
      schoolId: currentUser.schoolId,
      type: { in: types },
      relatedEntityType,
      relatedEntityId,
      status: { in: OPEN_TASK_STATUSES }
    },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedByUserId: currentUser.id
    }
  });
}

async function loadMakeup(tx: Prisma.TransactionClient, id: string) {
  return tx.makeupCredit.findUniqueOrThrow({
    where: { id },
    include: makeupInclude
  });
}

async function loadGroupEvent(tx: Prisma.TransactionClient, id: string) {
  return tx.groupEvent.findUniqueOrThrow({
    where: { id },
    include: groupEventInclude
  });
}

function serializeLessonRef(lesson: { id: string; lessonDate: Date; startTime: string; endTime: string }) {
  return {
    id: lesson.id,
    lessonDate: dateToKey(lesson.lessonDate),
    startTime: lesson.startTime,
    endTime: lesson.endTime
  };
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

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}
