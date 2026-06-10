import type { LessonChangeReason, LessonStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { buildLessonCandidates, dateToKey } from "./generation";
import type {
  CancelLessonInput,
  CreateLessonInput,
  CreateScheduleTemplateInput,
  GenerateMonthInput,
  MoveLessonInput,
  SubstituteLessonInput
} from "./schemas";

const templateInclude = {
  group: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  coach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true, status: true } } } }
} as const;

const lessonInclude = {
  group: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  coach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true, status: true } } } },
  substituteCoach: { select: { id: true, userId: true, user: { select: { displayName: true, login: true, status: true } } } },
  scheduleTemplate: { select: { id: true, weekday: true } }
} as const;

type TemplateRecord = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: Date;
  group: { id: string; name: string };
  branch: { id: string; name: string };
  coach: { id: string; userId: string; user: { displayName: string; login: string; status: string } };
};

type LessonRecord = {
  id: string;
  lessonDate: Date;
  startTime: string;
  endTime: string;
  status: LessonStatus;
  changeReason: LessonChangeReason | null;
  changeComment: string | null;
  createdAt: Date;
  group: { id: string; name: string };
  branch: { id: string; name: string };
  coach: { id: string; userId: string; user: { displayName: string; login: string; status: string } };
  substituteCoach: { id: string; userId: string; user: { displayName: string; login: string; status: string } } | null;
  scheduleTemplate: { id: string; weekday: number } | null;
};

function serializeCoach(coach: LessonRecord["coach"] | NonNullable<LessonRecord["substituteCoach"]>) {
  return {
    id: coach.id,
    userId: coach.userId,
    displayName: coach.user.displayName,
    login: coach.user.login,
    status: coach.user.status
  };
}

export function serializeScheduleTemplate(template: TemplateRecord) {
  return {
    id: template.id,
    weekday: template.weekday,
    startTime: template.startTime,
    endTime: template.endTime,
    status: template.status,
    group: template.group,
    branch: template.branch,
    coach: serializeCoach(template.coach),
    createdAt: template.createdAt.toISOString()
  };
}

export function serializeLesson(lesson: LessonRecord) {
  return {
    id: lesson.id,
    lessonDate: dateToKey(lesson.lessonDate),
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    status: lesson.status,
    changeReason: lesson.changeReason,
    changeComment: lesson.changeComment,
    group: lesson.group,
    branch: lesson.branch,
    coach: serializeCoach(lesson.coach),
    substituteCoach: lesson.substituteCoach ? serializeCoach(lesson.substituteCoach) : null,
    scheduleTemplate: lesson.scheduleTemplate,
    createdAt: lesson.createdAt.toISOString()
  };
}

export async function listScheduleTemplates(currentUser: CurrentUser) {
  const templates = await getPrisma().scheduleTemplate.findMany({
    where: { schoolId: currentUser.schoolId },
    include: templateInclude,
    orderBy: [{ status: "asc" }, { weekday: "asc" }, { startTime: "asc" }]
  });

  return templates.map(serializeScheduleTemplate);
}

export async function createScheduleTemplate(currentUser: CurrentUser, input: CreateScheduleTemplateInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const group = await tx.trainingGroup.findFirstOrThrow({
      where: {
        id: input.groupId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      },
      select: { id: true, branchId: true, mainCoachId: true }
    });

    const template = await tx.scheduleTemplate.create({
      data: {
        schoolId: currentUser.schoolId,
        groupId: group.id,
        branchId: group.branchId,
        coachId: group.mainCoachId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime
      },
      include: templateInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "SCHEDULE_TEMPLATE_CREATED",
        entityType: "ScheduleTemplate",
        entityId: template.id,
        newValue: serializeScheduleTemplate(template)
      },
      tx
    );

    return serializeScheduleTemplate(template);
  });
}

export async function listLessons(currentUser: CurrentUser) {
  const lessons = await getPrisma().lesson.findMany({
    where: { schoolId: currentUser.schoolId },
    include: lessonInclude,
    orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }, { group: { name: "asc" } }]
  });

  return lessons.map(serializeLesson);
}

export async function listCoachLessons(currentUser: CurrentUser) {
  if (currentUser.role !== "COACH") {
    throw new Error("Доступно только тренеру.");
  }

  const coach = await getPrisma().coachProfile.findFirstOrThrow({
    where: {
      schoolId: currentUser.schoolId,
      userId: currentUser.id
    }
  });

  const lessons = await getPrisma().lesson.findMany({
    where: {
      schoolId: currentUser.schoolId,
      OR: [{ coachId: coach.id }, { substituteCoachId: coach.id }]
    },
    include: lessonInclude,
    orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }]
  });

  return lessons.map(serializeLesson);
}

export async function createLesson(currentUser: CurrentUser, input: CreateLessonInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const group = await tx.trainingGroup.findFirstOrThrow({
      where: {
        id: input.groupId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      },
      select: { id: true, branchId: true, mainCoachId: true }
    });

    const coachId = input.coachId ?? group.mainCoachId;

    await ensureActiveCoach(tx, currentUser.schoolId, coachId);

    const lesson = await tx.lesson.create({
      data: {
        schoolId: currentUser.schoolId,
        groupId: group.id,
        branchId: group.branchId,
        coachId,
        lessonDate: input.lessonDate,
        startTime: input.startTime,
        endTime: input.endTime
      },
      include: lessonInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "LESSON_CREATED",
        entityType: "Lesson",
        entityId: lesson.id,
        newValue: serializeLesson(lesson)
      },
      tx
    );

    return serializeLesson(lesson);
  });
}

export async function generateLessonsForMonth(currentUser: CurrentUser, input: GenerateMonthInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const templates = await tx.scheduleTemplate.findMany({
      where: {
        schoolId: currentUser.schoolId,
        status: "ACTIVE",
        ...(input.groupId ? { groupId: input.groupId } : {})
      },
      select: {
        id: true,
        groupId: true,
        branchId: true,
        coachId: true,
        weekday: true,
        startTime: true,
        endTime: true
      }
    });

    const candidates = buildLessonCandidates(templates, input.month);
    const createdIds: string[] = [];
    const duplicateKeys: string[] = [];

    for (const candidate of candidates) {
      const duplicate = await tx.lesson.findFirst({
        where: {
          groupId: candidate.groupId,
          lessonDate: candidate.lessonDate,
          startTime: candidate.startTime
        },
        select: { id: true }
      });

      if (duplicate) {
        duplicateKeys.push(`${candidate.groupId}:${dateToKey(candidate.lessonDate)}:${candidate.startTime}`);
        continue;
      }

      const lesson = await tx.lesson.create({
        data: {
          schoolId: currentUser.schoolId,
          groupId: candidate.groupId,
          branchId: candidate.branchId,
          coachId: candidate.coachId,
          scheduleTemplateId: candidate.scheduleTemplateId,
          lessonDate: candidate.lessonDate,
          startTime: candidate.startTime,
          endTime: candidate.endTime
        },
        select: { id: true }
      });

      createdIds.push(lesson.id);
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "LESSONS_GENERATED_FOR_MONTH",
        entityType: "Lesson",
        newValue: {
          month: input.month,
          groupId: input.groupId ?? null,
          templateCount: templates.length,
          candidatesCount: candidates.length,
          createdCount: createdIds.length,
          skippedDuplicateCount: duplicateKeys.length
        }
      },
      tx
    );

    return {
      month: input.month,
      templateCount: templates.length,
      candidatesCount: candidates.length,
      createdCount: createdIds.length,
      skippedDuplicateCount: duplicateKeys.length,
      duplicateKeys
    };
  });
}

export async function moveLesson(currentUser: CurrentUser, lessonId: string, input: MoveLessonInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.lesson.findFirstOrThrow({
      where: {
        id: lessonId,
        schoolId: currentUser.schoolId
      },
      include: lessonInclude
    });

    const updated = await tx.lesson.update({
      where: { id: existing.id },
      data: {
        lessonDate: input.lessonDate,
        startTime: input.startTime,
        endTime: input.endTime,
        status: "MOVED",
        changeReason: input.reason,
        changeComment: input.comment
      },
      include: lessonInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "LESSON_MOVED",
        entityType: "Lesson",
        entityId: updated.id,
        oldValue: {
          lessonDate: dateToKey(existing.lessonDate),
          startTime: existing.startTime,
          endTime: existing.endTime,
          status: existing.status
        },
        newValue: {
          lessonDate: dateToKey(updated.lessonDate),
          startTime: updated.startTime,
          endTime: updated.endTime,
          status: updated.status,
          reason: updated.changeReason,
          comment: updated.changeComment
        },
        comment: input.comment
      },
      tx
    );

    return serializeLesson(updated);
  });
}

export async function cancelLesson(currentUser: CurrentUser, lessonId: string, input: CancelLessonInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.lesson.findFirstOrThrow({
      where: {
        id: lessonId,
        schoolId: currentUser.schoolId
      },
      include: lessonInclude
    });

    const updated = await tx.lesson.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        changeReason: input.reason,
        changeComment: input.comment
      },
      include: lessonInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "LESSON_CANCELLED",
        entityType: "Lesson",
        entityId: updated.id,
        oldValue: { status: existing.status },
        newValue: {
          status: updated.status,
          reason: updated.changeReason,
          comment: updated.changeComment
        },
        comment: input.comment
      },
      tx
    );

    return serializeLesson(updated);
  });
}

export async function substituteLesson(currentUser: CurrentUser, lessonId: string, input: SubstituteLessonInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.lesson.findFirstOrThrow({
      where: {
        id: lessonId,
        schoolId: currentUser.schoolId
      },
      include: lessonInclude
    });

    const substituteCoach = await ensureActiveCoach(tx, currentUser.schoolId, input.substituteCoachId);

    const updated = await tx.lesson.update({
      where: { id: existing.id },
      data: {
        substituteCoachId: substituteCoach.id
      },
      include: lessonInclude
    });

    await tx.task.create({
      data: {
        schoolId: currentUser.schoolId,
        type: "COACH_SUBSTITUTION_ASSIGNED",
        priority: "MEDIUM",
        assigneeUserId: substituteCoach.userId,
        relatedEntityType: "Lesson",
        relatedEntityId: updated.id,
        title: `Назначена замена: ${updated.group.name}`,
        description: `${dateToKey(updated.lessonDate)} ${updated.startTime}-${updated.endTime}`
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "LESSON_SUBSTITUTE_ASSIGNED",
        entityType: "Lesson",
        entityId: updated.id,
        oldValue: {
          substituteCoachId: existing.substituteCoach?.id ?? null,
          substituteCoachName: existing.substituteCoach?.user.displayName ?? null
        },
        newValue: {
          substituteCoachId: updated.substituteCoach?.id ?? null,
          substituteCoachName: updated.substituteCoach?.user.displayName ?? null
        }
      },
      tx
    );

    return serializeLesson(updated);
  });
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав для управления расписанием.");
  }
}

async function ensureActiveCoach(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  schoolId: string,
  coachId: string
) {
  return tx.coachProfile.findFirstOrThrow({
    where: {
      id: coachId,
      schoolId,
      user: {
        role: "COACH",
        status: "ACTIVE"
      }
    },
    select: {
      id: true,
      userId: true
    }
  });
}
