import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { assertGroupHasWeekday, ensureEnrollmentSubscriptions } from "@/server/children/child-service";
import { normalizeOptionalPhone } from "@/server/parents/phone";
import { resolveFirstPaidLessonDate } from "@/server/children/enrollment-dates";
import { setCurrentGroupMembership } from "@/server/children/group-membership";
import { countActiveChildren } from "@/server/groups/capacity";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import { closeTasksByCondition, createTaskIfNotExists, ensureGroupOverCapacityTask } from "@/server/tasks/task-service";
import type { ConvertTrialInput, CreateTrialInput, UpdateTrialStatusInput } from "./schemas";
import {
  assertTrialCanBeConverted,
  canCoachEditTrial,
  canCoachSetTrialStatus,
  trialClosesProcessingTask,
  trialNeedsProcessingTask
} from "./rules";

const trialInclude = {
  lesson: {
    select: {
      id: true,
      lessonDate: true,
      startTime: true,
      endTime: true,
      status: true,
      branch: { select: { id: true, name: true } },
      coach: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
      substituteCoach: { select: { id: true, userId: true, user: { select: { displayName: true } } } }
    }
  },
  group: { select: { id: true, name: true, capacityLimit: true } },
  coach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true } } } },
  convertedChild: { select: { id: true, fullName: true, status: true } },
  signingPackage: { select: { status: true, contractStatus: true, consentStatus: true, errorMessage: true, sentAt: true, checkedAt: true } },
  createdBy: { select: { id: true, displayName: true, login: true, role: true } }
} as const;

const lessonForTrialInclude = {
  group: { select: { id: true, name: true } },
  coach: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
  substituteCoach: { select: { id: true, userId: true, user: { select: { displayName: true } } } }
} as const;

type TrialRecord = Prisma.TrialParticipantGetPayload<{ include: typeof trialInclude }>;
type LessonForTrial = Prisma.LessonGetPayload<{ include: typeof lessonForTrialInclude }>;

export function serializeTrial(trial: TrialRecord) {
  return {
    id: trial.id,
    lessonId: trial.lessonId,
    groupId: trial.groupId,
    coachId: trial.coachId,
    convertedChildId: trial.convertedChildId,
    childName: trial.childName,
    childAge: trial.childAge,
    parentName: trial.parentName,
    parentPhone: trial.parentPhone,
    parentVkUrl: trial.parentVkUrl,
    source: trial.source,
    status: trial.status,
    trialAttended: trial.trialAttended,
    signingPackage: trial.signingPackage ? {
      status: trial.signingPackage.status,
      contractStatus: trial.signingPackage.contractStatus,
      consentStatus: trial.signingPackage.consentStatus,
      errorMessage: trial.signingPackage.errorMessage,
      sentAt: trial.signingPackage.sentAt?.toISOString() ?? null,
      checkedAt: trial.signingPackage.checkedAt?.toISOString() ?? null
    } : null,
    comment: trial.comment,
    convertedAt: trial.convertedAt?.toISOString() ?? null,
    createdAt: trial.createdAt.toISOString(),
    lesson: {
      id: trial.lesson.id,
      lessonDate: dateToKey(trial.lesson.lessonDate),
      startTime: trial.lesson.startTime,
      endTime: trial.lesson.endTime,
      status: trial.lesson.status,
      branch: trial.lesson.branch,
      coachName: trial.lesson.coach.user.displayName,
      substituteCoachName: trial.lesson.substituteCoach?.user.displayName ?? null
    },
    group: trial.group,
    coach: {
      id: trial.coach.id,
      userId: trial.coach.userId,
      displayName: trial.coach.user.displayName,
      login: trial.coach.user.login
    },
    convertedChild: trial.convertedChild,
    createdBy: trial.createdBy
  };
}

export async function listTrials(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const trials = await getPrisma().trialParticipant.findMany({
    where: { schoolId: currentUser.schoolId },
    include: trialInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return trials.map(serializeTrial);
}

export async function listLessonTrials(currentUser: CurrentUser, lessonId: string) {
  const prisma = getPrisma();
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { id: lessonId, schoolId: currentUser.schoolId },
    include: lessonForTrialInclude
  });

  assertCanAccessLesson(currentUser, lesson);

  const trials = await prisma.trialParticipant.findMany({
    where: { schoolId: currentUser.schoolId, lessonId },
    include: trialInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }]
  });

  return trials.map(serializeTrial);
}

export async function createTrial(currentUser: CurrentUser, input: CreateTrialInput) {
  assertAdminOrCoach(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const lesson = await tx.lesson.findFirstOrThrow({
      where: { id: input.lessonId, schoolId: currentUser.schoolId },
      include: lessonForTrialInclude
    });

    assertCanAccessLesson(currentUser, lesson);

    const trial = await tx.trialParticipant.create({
      data: {
        schoolId: currentUser.schoolId,
        lessonId: lesson.id,
        groupId: lesson.groupId,
        coachId: selectResponsibleCoachId(currentUser, lesson),
        childName: input.childName ?? null,
        childAge: input.childAge ?? null,
        parentName: input.parentName ?? null,
        parentPhone: input.parentPhone ?? null,
        parentVkUrl: input.parentVkUrl ?? null,
        source: input.source,
        comment: input.comment ?? null,
        createdByUserId: currentUser.id
      },
      include: trialInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "TRIAL_CREATED",
        entityType: "TrialParticipant",
        entityId: trial.id,
        newValue: serializeTrial(trial)
      },
      tx
    );

    return serializeTrial(trial);
  });
}

export async function updateTrialStatus(currentUser: CurrentUser, trialId: string, input: UpdateTrialStatusInput) {
  assertAdminOrCoach(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.trialParticipant.findFirstOrThrow({
      where: { id: trialId, schoolId: currentUser.schoolId },
      include: trialInclude
    });

    assertCanAccessTrial(currentUser, existing);

    const nextStatus = input.status ?? existing.status;

    if (currentUser.role === "COACH") {
      if (!canCoachEditTrial(existing.status)) {
        throw new Error("Этот пробник уже закрыт для тренера.");
      }

      if (input.status && !canCoachSetTrialStatus(input.status)) {
        throw new Error("Тренер может отметить только контакт, приход или неприход пробника.");
      }
    }

    const updated = await tx.trialParticipant.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        trialAttended: input.status === "TRIAL_ATTENDED" ? true : input.status === "TRIAL_NO_SHOW" ? false : undefined,
        childName: input.childName !== undefined ? input.childName : undefined,
        childAge: input.childAge !== undefined ? input.childAge : undefined,
        parentName: input.parentName !== undefined ? input.parentName : undefined,
        parentPhone: input.parentPhone !== undefined ? input.parentPhone : undefined,
        parentVkUrl: input.parentVkUrl !== undefined ? input.parentVkUrl : undefined,
        source: input.source ?? undefined,
        comment: input.comment !== undefined ? input.comment : undefined
      },
      include: trialInclude
    });

    if (trialNeedsProcessingTask(updated.status)) {
      await ensureTrialProcessingTask(tx, currentUser, updated);
    }

    if (trialClosesProcessingTask(updated.status)) {
      await closeTrialProcessingTask(tx, currentUser, updated, "Пробник обработан.");
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "TRIAL_STATUS_UPDATED",
        entityType: "TrialParticipant",
        entityId: updated.id,
        oldValue: { status: existing.status },
        newValue: {
          status: updated.status,
          childName: updated.childName,
          parentPhone: updated.parentPhone,
          source: updated.source
        }
      },
      tx
    );

    return serializeTrial(updated);
  });
}

export async function convertTrial(currentUser: CurrentUser, trialId: string, input: ConvertTrialInput, options?: { initialChildStatus?: "ACTIVE" | "PAUSED" }) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    // Serialize a manual conversion racing with the test journey's status poll.
    await tx.$queryRaw`SELECT "id" FROM "trial_participants" WHERE "id" = ${trialId}::uuid FOR UPDATE`;
    const existing = await tx.trialParticipant.findFirstOrThrow({
      where: { id: trialId, schoolId: currentUser.schoolId },
      include: trialInclude
    });

    const testJourney = await tx.trialTestJourney.findUnique({ where: { trialId } });
    if (testJourney) {
      if (existing.signingPackage?.status !== "SIGNED") throw new Error("Для тестовой заявки сначала подпишите оба документа.");
      if (options?.initialChildStatus !== "PAUSED") throw new Error("Тестовая заявка активируется только после тестовой оплаты.");
    }

    assertTrialCanBeConverted(existing.status);
    if (existing.trialAttended === null) throw new Error("Сначала отметьте, был ли ребёнок на пробном занятии.");

    const childFullName = input.childFullName ?? existing.childName;

    if (!childFullName || childFullName.length < 2) {
      throw new Error("Для конвертации нужно имя ребёнка.");
    }

    const currentGroupId = input.currentGroupId ?? existing.groupId;
    const startDate = await resolveFirstPaidLessonDate(
      tx,
      currentUser.schoolId,
      currentGroupId,
      input.firstPaidLessonDate,
      existing.lesson.lessonDate
    );
    const parentName = input.parentName ?? existing.parentName;
    const parentPhone = normalizeOptionalPhone(input.parentPhone ?? existing.parentPhone);
    const parentVkUrl = input.parentVkUrl ?? existing.parentVkUrl;
    const planStartDate = input.attendancePlanStartDate ?? startDate;
    if (planStartDate < startDate) throw new Error("График не может начаться до первого платного занятия.");
    if (input.attendanceWeekday != null) {
      await assertGroupHasWeekday(tx, currentUser.schoolId, currentGroupId, input.attendanceWeekday, planStartDate);
    }

    const existingChild = input.existingChildId ? await tx.child.findFirstOrThrow({
      where: { id: input.existingChildId, schoolId: currentUser.schoolId },
      include: { groupMemberships: { where: { endDate: null }, orderBy: { startDate: "desc" }, take: 1 } }
    }) : null;
    if (existingChild && existingChild.status !== "ACTIVE") throw new Error("Существующий ребёнок должен быть активным.");
    if (existingChild?.currentGroupId && existingChild.currentGroupId !== currentGroupId) {
      throw new Error("Существующий ребёнок состоит в другой группе. Сначала исправьте историю перевода.");
    }

    let parent = existingChild?.parentId ? await tx.parent.findUniqueOrThrow({ where: { id: existingChild.parentId } }) : null;
    if (!parent && input.existingParentId) {
      parent = await tx.parent.findFirstOrThrow({ where: { id: input.existingParentId, schoolId: currentUser.schoolId, archivedAt: null } });
    }
    if (!parent && parentPhone) {
      const matches = await tx.parent.findMany({ where: { schoolId: currentUser.schoolId, phone: parentPhone, archivedAt: null }, take: 2 });
      if (matches.length > 1) throw new Error("По телефону найдено несколько родителей. Выберите нужную карточку вручную.");
      if (testJourney && matches[0] && parentName &&
          matches[0].fullName?.trim().toLocaleLowerCase("ru") !== parentName.trim().toLocaleLowerCase("ru")) {
        throw new Error("Телефон уже есть у родителя с другим ФИО. Попросите администратора проверить совпадение.");
      }
      parent = matches[0] ?? null;
    }
    if (!parent && (parentName || parentPhone || parentVkUrl)) {
      parent = await tx.parent.create({ data: {
        schoolId: currentUser.schoolId, fullName: parentName, phone: parentPhone,
        vkProfileUrl: parentVkUrl, comment: `Создано из пробника ${existing.id}`
      } });
    }

    const child = existingChild ? await tx.child.update({
      where: { id: existingChild.id },
      data: { parentId: existingChild.parentId ?? parent?.id ?? null, currentGroupId }
    }) : await tx.child.create({ data: {
      schoolId: currentUser.schoolId, parentId: parent?.id ?? null, currentGroupId,
      fullName: childFullName, status: options?.initialChildStatus ?? "ACTIVE", coachComment: existing.comment,
      adminComment: input.adminComment ?? null, admissionStatus: "ADMITTED"
    } });

    if (existingChild?.groupMemberships[0]?.groupId === currentGroupId) {
      const open = existingChild.groupMemberships[0];
      if (startDate < open.startDate) {
        const prior = await tx.childGroupMembership.findFirst({
          where: { childId: child.id, id: { not: open.id }, endDate: { gt: startDate } }, select: { id: true }
        });
        if (prior) throw new Error("Дата первого платного занятия пересекается с предыдущей группой.");
        await tx.childGroupMembership.update({ where: { id: open.id }, data: { startDate } });
      }
    } else {
      await setCurrentGroupMembership(tx, child.id, currentGroupId, startDate);
    }
    if (input.attendanceWeekday != null) {
      await tx.childAttendancePlan.upsert({
        where: { childId_effectiveFrom: { childId: child.id, effectiveFrom: planStartDate } },
        create: { childId: child.id, effectiveFrom: planStartDate, weekday: input.attendanceWeekday },
        update: { weekday: input.attendanceWeekday }
      });
    }

    const updated = await tx.trialParticipant.update({
      where: { id: existing.id },
      data: {
        status: "CONVERTED_TO_ACTIVE",
        convertedChildId: child.id,
        convertedAt: new Date()
      },
      include: trialInclude
    });

    await closeTrialProcessingTask(tx, currentUser, updated, "Пробник конвертирован в ребёнка.");

    const group = await tx.trainingGroup.findUnique({
      where: { id: currentGroupId },
      select: { id: true, name: true, capacityLimit: true, children: { select: { id: true, status: true } } }
    });

    if (group) {
      await ensureGroupOverCapacityTask(tx, {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        groupId: group.id,
        groupName: group.name,
        activeChildrenCount: countActiveChildren(group.children),
        capacityLimit: group.capacityLimit
      });
    }

    await ensureEnrollmentSubscriptions(tx, currentUser, child.id, startDate);

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "TRIAL_CONVERTED_TO_CHILD",
        entityType: "TrialParticipant",
        entityId: updated.id,
        oldValue: { status: existing.status },
        newValue: { status: updated.status, childId: child.id, parentId: parent?.id ?? null, firstPaidLessonDate: dateToKey(startDate) }
      },
      tx
    );

    return { trial: serializeTrial(updated), childId: child.id, parentId: parent?.id ?? null };
  });
}

async function ensureTrialProcessingTask(tx: Prisma.TransactionClient, currentUser: CurrentUser, trial: TrialRecord) {
  const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);
  const lessonDate = dateToKey(trial.lesson.lessonDate);
  const description = trial.childName
    ? `Пробник ${trial.childName} был на пробном занятии ${lessonDate}. Нужно обработать результат и принять решение.`
    : `Пробник без имени был на пробном занятии ${lessonDate}. Нужно проверить контакты и обработать.`;

  await createTaskIfNotExists(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    type: "TRIAL_NEEDS_PROCESSING",
    priority: "HIGH",
    assigneeUserId: adminUserId,
    relatedEntityType: "TrialParticipant",
    relatedEntityId: trial.id,
    groupId: trial.groupId,
    title: "Обработать пробника",
    description
  });
}

async function closeTrialProcessingTask(tx: Prisma.TransactionClient, currentUser: CurrentUser, trial: Pick<TrialRecord, "id">, comment: string) {
  await closeTasksByCondition(tx, {
    schoolId: currentUser.schoolId,
    actorUserId: currentUser.id,
    where: {
      type: "TRIAL_NEEDS_PROCESSING",
      relatedEntityType: "TrialParticipant",
      relatedEntityId: trial.id
    },
    comment
  });
}

function assertCanAccessTrial(currentUser: CurrentUser, trial: TrialRecord) {
  if (hasRole(currentUser, ADMIN_ROLES)) {
    return;
  }

  if (currentUser.role === "COACH") {
    const canAccess = trial.lesson.coach.userId === currentUser.id || trial.lesson.substituteCoach?.userId === currentUser.id;

    if (canAccess) {
      return;
    }
  }

  throw new Error("Пробник недоступен этому пользователю.");
}

function assertCanAccessLesson(currentUser: CurrentUser, lesson: LessonForTrial) {
  if (hasRole(currentUser, ADMIN_ROLES)) {
    return;
  }

  if (currentUser.role === "COACH") {
    const canAccess = lesson.coach.userId === currentUser.id || lesson.substituteCoach?.userId === currentUser.id;

    if (canAccess) {
      return;
    }
  }

  throw new Error("Занятие недоступно этому пользователю.");
}

function selectResponsibleCoachId(currentUser: CurrentUser, lesson: LessonForTrial) {
  if (currentUser.role === "COACH" && lesson.substituteCoach?.userId === currentUser.id) {
    return lesson.substituteCoach.id;
  }

  return lesson.substituteCoach?.id ?? lesson.coach.id;
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

function assertAdminOrCoach(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES) && currentUser.role !== "COACH") {
    throw new Error("Недостаточно прав.");
  }
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}
