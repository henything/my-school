import type { CoachAttendanceStatus, TaskStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import { applyAttendanceBalanceEffect } from "@/server/billing/billing-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import type {
  AttendanceNotFilledJobInput,
  AttendanceRecordInput,
  SaveAttendanceInput,
  UpdateAttendanceRecordInput
} from "./schemas";

const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

const lessonDetailInclude = {
  branch: { select: { id: true, name: true } },
  coach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true, status: true } } } },
  substituteCoach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true, status: true } } } },
  group: {
    select: {
      id: true,
      name: true,
      children: {
        where: { status: "ACTIVE" },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          birthDate: true,
          status: true,
          medicalNotes: true,
          coachComment: true,
          adminComment: true,
          admissionStatus: true,
          parent: { select: { id: true, fullName: true, phone: true, vkProfileUrl: true } }
        }
      }
    }
  },
  attendanceRecords: {
    select: {
      id: true,
      childId: true,
      status: true,
      comment: true,
      markedAt: true,
      markedByUserId: true,
      finalStatus: true
    }
  }
} as const;

type LessonDetailRecord = Prisma.LessonGetPayload<{ include: typeof lessonDetailInclude }>;
type AttendanceRecordForUpdate = {
  id: string;
  lessonId: string;
  childId: string;
  status: CoachAttendanceStatus;
  comment: string | null;
};

export function calculateAge(birthDate: Date | null, atDate: Date) {
  if (!birthDate) {
    return null;
  }

  let age = atDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = atDate.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = atDate.getUTCDate() - birthDate.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

export function serializeCoachLessonDetail(lesson: LessonDetailRecord) {
  const recordsByChildId = new Map(lesson.attendanceRecords.map((record) => [record.childId, record]));

  return {
    id: lesson.id,
    lessonDate: dateToKey(lesson.lessonDate),
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    status: lesson.status,
    group: lesson.group,
    branch: lesson.branch,
    coach: {
      id: lesson.coach.id,
      userId: lesson.coach.userId,
      displayName: lesson.coach.user.displayName,
      login: lesson.coach.user.login,
      status: lesson.coach.user.status
    },
    substituteCoach: lesson.substituteCoach
      ? {
          id: lesson.substituteCoach.id,
          userId: lesson.substituteCoach.userId,
          displayName: lesson.substituteCoach.user.displayName,
          login: lesson.substituteCoach.user.login,
          status: lesson.substituteCoach.user.status
        }
      : null,
    children: lesson.group.children.map((child) => {
      const record = recordsByChildId.get(child.id);

      return {
        id: child.id,
        fullName: child.fullName,
        age: calculateAge(child.birthDate, lesson.lessonDate),
        birthDate: child.birthDate?.toISOString().slice(0, 10) ?? null,
        status: child.status,
        medicalNotes: child.medicalNotes,
        coachComment: child.coachComment,
        adminComment: child.adminComment,
        admissionStatus: child.admissionStatus,
        parent: child.parent,
        attendance: record
          ? {
              id: record.id,
              status: record.status,
              comment: record.comment,
              markedAt: record.markedAt?.toISOString() ?? null,
              markedByUserId: record.markedByUserId,
              finalStatus: record.finalStatus
            }
          : {
              id: null,
              status: "NOT_MARKED" as const,
              comment: null,
              markedAt: null,
              markedByUserId: null,
              finalStatus: null
            }
      };
    })
  };
}

export async function getCoachLessonDetail(currentUser: CurrentUser, lessonId: string) {
  const lesson = await getPrisma().lesson.findFirstOrThrow({
    where: {
      id: lessonId,
      schoolId: currentUser.schoolId
    },
    include: lessonDetailInclude
  });

  assertCanAccessLesson(currentUser, lesson);

  return serializeCoachLessonDetail(lesson);
}

export async function saveCoachAttendance(currentUser: CurrentUser, lessonId: string, input: SaveAttendanceInput) {
  return getPrisma().$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirstOrThrow({
      where: {
        id: lessonId,
        schoolId: currentUser.schoolId
      },
      include: lessonDetailInclude
    });

    assertCanEditAttendance(currentUser, lesson);
    assertLessonCanReceiveAttendance(lesson);

    const childIds = lesson.group.children.map((child) => child.id);
    const childIdSet = new Set(childIds);
    const seenChildIds = new Set<string>();

    for (const recordInput of input.records) {
      if (!childIdSet.has(recordInput.childId)) {
        throw new Error("Ребёнок не относится к группе этого занятия.");
      }

      if (seenChildIds.has(recordInput.childId)) {
        throw new Error("Один ребёнок не может быть передан в табеле дважды.");
      }

      seenChildIds.add(recordInput.childId);
      await upsertAttendanceRecord(tx, currentUser, lesson, recordInput);
    }

    await refreshLessonAttendanceStatus(tx, lesson.id, childIds);

    const updated = await tx.lesson.findUniqueOrThrow({
      where: { id: lesson.id },
      include: lessonDetailInclude
    });

    return serializeCoachLessonDetail(updated);
  });
}

export async function updateAttendanceRecord(currentUser: CurrentUser, recordId: string, input: UpdateAttendanceRecordInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findFirstOrThrow({
      where: { id: recordId },
      include: {
        lesson: {
          include: lessonDetailInclude
        }
      }
    });

    if (existing.lesson.schoolId !== currentUser.schoolId) {
      throw new Error("Запись табеля не найдена.");
    }

    assertCanEditAttendance(currentUser, existing.lesson);
    assertLessonCanReceiveAttendance(existing.lesson);

    const childIds = existing.lesson.group.children.map((child) => child.id);

    await updateAttendanceRecordInternal(tx, currentUser, existing.lesson, existing, {
      childId: existing.childId,
      status: input.status,
      comment: input.comment
    });
    await refreshLessonAttendanceStatus(tx, existing.lesson.id, childIds);

    const updatedLesson = await tx.lesson.findUniqueOrThrow({
      where: { id: existing.lesson.id },
      include: lessonDetailInclude
    });

    return serializeCoachLessonDetail(updatedLesson);
  });
}

export async function runAttendanceNotFilledCheck(currentUser: CurrentUser, input: AttendanceNotFilledJobInput = {}) {
  assertAdmin(currentUser);

  const now = input.now ?? new Date();
  const local = pacificDateParts(now);

  if (local.hour < 18) {
    return { checkedCount: 0, incompleteCount: 0, createdTaskCount: 0 };
  }

  return getPrisma().$transaction(async (tx) => {
    const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);
    const lessons = await tx.lesson.findMany({
      where: {
        schoolId: currentUser.schoolId,
        lessonDate: { lte: new Date(`${local.dateKey}T00:00:00.000Z`) },
        status: { in: ["SCHEDULED", "ATTENDANCE_PENDING"] }
      },
      include: lessonDetailInclude,
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }]
    });

    let incompleteCount = 0;
    let createdTaskCount = 0;

    for (const lesson of lessons) {
      const childIds = lesson.group.children.map((child) => child.id);
      const markedCount = lesson.attendanceRecords.filter(
        (record) => childIds.includes(record.childId) && record.status !== "NOT_MARKED"
      ).length;
      const isIncomplete = childIds.length > 0 && markedCount < childIds.length;

      if (!isIncomplete) {
        continue;
      }

      incompleteCount += 1;
      const assigneeUserId = lesson.substituteCoach?.userId ?? lesson.coach.userId;
      const title = `Не заполнен табель: ${lesson.group.name}`;
      const description = `${dateToKey(lesson.lessonDate)} ${lesson.startTime}-${lesson.endTime}`;

      const coachTask = await ensureTask(tx, {
        schoolId: currentUser.schoolId,
        type: "ATTENDANCE_NOT_FILLED",
        priority: "CRITICAL",
        assigneeUserId,
        relatedEntityType: "Lesson",
        relatedEntityId: lesson.id,
        groupId: lesson.group.id,
        title,
        description
      });

      const adminTask = await ensureTask(tx, {
        schoolId: currentUser.schoolId,
        type: "ATTENDANCE_NOT_FILLED",
        priority: "CRITICAL",
        assigneeUserId: adminUserId,
        relatedEntityType: "Lesson",
        relatedEntityId: lesson.id,
        groupId: lesson.group.id,
        title: `Проверить табель: ${lesson.group.name}`,
        description
      });

      createdTaskCount += Number(coachTask.created) + Number(adminTask.created);
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "ATTENDANCE_NOT_FILLED_CHECK_RUN",
        entityType: "Lesson",
        newValue: {
          checkedCount: lessons.length,
          incompleteCount,
          createdTaskCount,
          now: now.toISOString()
        }
      },
      tx
    );

    return { checkedCount: lessons.length, incompleteCount, createdTaskCount };
  });
}

async function upsertAttendanceRecord(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonDetailRecord,
  input: AttendanceRecordInput
) {
  const existing = await tx.attendanceRecord.findUnique({
    where: {
      lessonId_childId: {
        lessonId: lesson.id,
        childId: input.childId
      }
    }
  });

  if (!existing) {
    const record = await tx.attendanceRecord.create({
      data: {
        lessonId: lesson.id,
        childId: input.childId,
        status: input.status,
        comment: input.comment ?? null,
        markedByUserId: input.status === "NOT_MARKED" ? null : currentUser.id,
        markedAt: input.status === "NOT_MARKED" ? null : new Date()
      }
    });

    await auditAttendanceChange(tx, currentUser, record.id, null, record);
    await applyAttendanceSideEffects(tx, currentUser, lesson, record);
    return record;
  }

  return updateAttendanceRecordInternal(tx, currentUser, lesson, existing, input);
}

async function updateAttendanceRecordInternal(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonDetailRecord,
  existing: AttendanceRecordForUpdate,
  input: AttendanceRecordInput | UpdateAttendanceRecordInput & { childId: string }
) {
  const nextComment = input.comment ?? null;
  const changed = existing.status !== input.status || existing.comment !== nextComment;

  const record = await tx.attendanceRecord.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      comment: nextComment,
      markedByUserId: input.status === "NOT_MARKED" ? null : currentUser.id,
      markedAt: input.status === "NOT_MARKED" ? null : new Date()
    }
  });

  if (changed) {
    await auditAttendanceChange(tx, currentUser, record.id, existing, record);
  }

  await applyAttendanceSideEffects(tx, currentUser, lesson, record);

  return record;
}

async function applyAttendanceSideEffects(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonDetailRecord,
  record: AttendanceRecordForUpdate
) {
  await applyAttendanceBalanceEffect(tx, currentUser, lesson, record);

  if (record.status === "ABSENT_SICK_PENDING") {
    await ensureCertificatePendingTask(tx, currentUser, lesson, record.childId, record.id);
  }

  if (record.status === "ABSENT_UNEXCUSED") {
    await ensureConsecutiveUnexcusedTask(tx, currentUser, lesson, record.childId);
  }
}

async function refreshLessonAttendanceStatus(tx: Prisma.TransactionClient, lessonId: string, childIds: string[]) {
  if (childIds.length === 0) {
    return null;
  }

  const markedCount = await tx.attendanceRecord.count({
    where: {
      lessonId,
      childId: { in: childIds },
      status: { not: "NOT_MARKED" }
    }
  });
  const nextStatus = markedCount === childIds.length ? "ATTENDANCE_COMPLETED" : "ATTENDANCE_PENDING";

  return tx.lesson.update({
    where: { id: lessonId },
    data: { status: nextStatus }
  });
}

async function ensureCertificatePendingTask(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonDetailRecord,
  childId: string,
  attendanceRecordId: string
) {
  const child = lesson.group.children.find((item) => item.id === childId);
  const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);

  return ensureTask(tx, {
    schoolId: currentUser.schoolId,
    type: "CERTIFICATE_PENDING",
    priority: "HIGH",
    assigneeUserId: adminUserId,
    relatedEntityType: "AttendanceRecord",
    relatedEntityId: attendanceRecordId,
    childId,
    groupId: lesson.group.id,
    title: `Нужна справка: ${child?.fullName ?? "ребёнок"}`,
    description: `${lesson.group.name}, ${dateToKey(lesson.lessonDate)}`
  });
}

async function ensureConsecutiveUnexcusedTask(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: LessonDetailRecord,
  childId: string
) {
  const records = await tx.attendanceRecord.findMany({
    where: {
      childId,
      status: { not: "NOT_MARKED" },
      lesson: {
        schoolId: currentUser.schoolId
      }
    },
    include: {
      lesson: { select: { id: true, lessonDate: true, startTime: true } }
    }
  });
  const ordered = records
    .sort((a, b) => {
      const left = `${dateToKey(a.lesson.lessonDate)}T${a.lesson.startTime}`;
      const right = `${dateToKey(b.lesson.lessonDate)}T${b.lesson.startTime}`;
      return left.localeCompare(right);
    })
    .filter((record) => record.status !== "NOT_MARKED");
  const currentIndex = ordered.findIndex((record) => record.lessonId === lesson.id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : null;

  if (!previous || previous.status !== "ABSENT_UNEXCUSED") {
    return null;
  }

  const child = lesson.group.children.find((item) => item.id === childId);
  const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);

  return ensureTask(tx, {
    schoolId: currentUser.schoolId,
    type: "ABSENCE_NEEDS_FINALIZATION",
    priority: "HIGH",
    assigneeUserId: adminUserId,
    relatedEntityType: "Child",
    relatedEntityId: childId,
    childId,
    groupId: lesson.group.id,
    title: `Два пропуска подряд: ${child?.fullName ?? "ребёнок"}`,
    description: `${lesson.group.name}, последний пропуск ${dateToKey(lesson.lessonDate)}`
  });
}

async function auditAttendanceChange(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  recordId: string,
  oldRecord: AttendanceRecordForUpdate | null,
  newRecord: AttendanceRecordForUpdate
) {
  return writeAuditLog(
    {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "ATTENDANCE_RECORD_UPDATED",
      entityType: "AttendanceRecord",
      entityId: recordId,
      oldValue: oldRecord
        ? {
            status: oldRecord.status,
            comment: oldRecord.comment
          }
        : null,
      newValue: {
        status: newRecord.status,
        comment: newRecord.comment,
        childId: newRecord.childId,
        lessonId: newRecord.lessonId
      }
    },
    tx
  );
}

async function ensureTask(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    type: "ATTENDANCE_NOT_FILLED" | "CERTIFICATE_PENDING" | "ABSENCE_NEEDS_FINALIZATION";
    priority: "CRITICAL" | "HIGH";
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
      assigneeUserId: input.assigneeUserId,
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

function assertCanAccessLesson(currentUser: CurrentUser, lesson: LessonDetailRecord) {
  if (lesson.schoolId !== currentUser.schoolId) {
    throw new Error("Занятие не найдено.");
  }

  if (currentUser.role === "COACH") {
    const canAccess = lesson.coach.userId === currentUser.id || lesson.substituteCoach?.userId === currentUser.id;

    if (!canAccess) {
      throw new Error("Занятие недоступно этому тренеру.");
    }

    return;
  }

  if (hasRole(currentUser, ADMIN_ROLES)) {
    return;
  }

  throw new Error("Недостаточно прав.");
}

function assertCanEditAttendance(currentUser: CurrentUser, lesson: LessonDetailRecord) {
  assertCanAccessLesson(currentUser, lesson);

  if (currentUser.role === "COACH" || hasRole(currentUser, ADMIN_ROLES)) {
    return;
  }

  throw new Error("Недостаточно прав для изменения табеля.");
}

function assertLessonCanReceiveAttendance(lesson: LessonDetailRecord) {
  if (lesson.status === "CANCELLED") {
    throw new Error("Нельзя заполнить табель отменённого занятия.");
  }
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}

function pacificDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour"))
  };
}
