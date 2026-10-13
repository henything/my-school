import type { CurrentUser } from "@/server/auth/current-user";
import { isLessonInChildPlan } from "@/server/children/attendance-plan";
import { isMemberOnDate } from "@/server/children/group-membership";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

const day = (date: Date) => date.toISOString().slice(0, 10);

export async function getAttendanceReport(currentUser: CurrentUser, filters: { from?: string; to?: string; branchId?: string; groupId?: string }) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = getPrisma();
  const firstLesson = await prisma.lesson.findFirst({ where: { schoolId: currentUser.schoolId }, orderBy: { lessonDate: "asc" }, select: { lessonDate: true } });
  const fromKey = filters.from ?? (firstLesson ? day(firstLesson.lessonDate) : day(new Date()));
  const toKey = filters.to ?? day(new Date());
  const from = new Date(`${fromKey}T00:00:00.000Z`);
  const to = new Date(`${toKey}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || day(from) !== fromKey || day(to) !== toKey || from > to) {
    throw new Error("Некорректный период отчёта.");
  }
  if ((to.getTime() - from.getTime()) / 86_400_000 > 366) throw new Error("Выберите период не длиннее 366 дней.");

  const [groups, lessons, children] = await Promise.all([
    prisma.trainingGroup.findMany({
      where: { schoolId: currentUser.schoolId, id: filters.groupId || undefined, branchId: filters.branchId || undefined },
      select: { id: true, name: true, capacityLimit: true, branchId: true, branch: { select: { name: true } }, children: { where: { status: "ACTIVE" }, select: { id: true } } },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.lesson.findMany({
      where: { schoolId: currentUser.schoolId, lessonDate: { gte: from, lte: to }, groupId: filters.groupId || undefined, branchId: filters.branchId || undefined },
      select: { id: true, groupId: true, lessonDate: true, startTime: true, status: true },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }]
    }),
    prisma.child.findMany({
      where: { schoolId: currentUser.schoolId },
      select: {
        id: true, fullName: true, status: true, currentGroupId: true,
        groupMemberships: { select: { groupId: true, startDate: true, endDate: true } },
        attendancePlans: { select: { effectiveFrom: true, weekday: true } },
        attendanceRecords: { where: { lesson: { lessonDate: { gte: from, lte: to } } }, select: { lessonId: true, status: true, lesson: { select: { groupId: true } } } },
        convertedTrials: { where: { lesson: { lessonDate: { gte: from, lte: to } } }, select: { lessonId: true, groupId: true, status: true, trialAttended: true } }
      },
      orderBy: { fullName: "asc" }
    })
  ]);
  const lessonsByGroup = new Map(groups.map((group) => [group.id, lessons.filter((lesson) => lesson.groupId === group.id)]));
  const dates = Array.from(new Set(lessons.map((lesson) => day(lesson.lessonDate)))).sort();
  const rows = children.flatMap((child) => {
    const relevantGroupIds = new Set([
      ...child.groupMemberships.filter((membership) => membership.startDate <= to && (!membership.endDate || membership.endDate > from)).map((membership) => membership.groupId),
      ...child.attendanceRecords.map((record) => record.lesson.groupId),
      ...child.convertedTrials.map((trial) => trial.groupId),
      ...(child.currentGroupId ? [child.currentGroupId] : [])
    ]);
    return groups.filter((group) => relevantGroupIds.has(group.id)).map((group) => {
      const ownLessons = lessonsByGroup.get(group.id) ?? [];
      const statusByDate = Object.fromEntries(dates.map((date) => [date, [] as string[]]));
      for (const lesson of ownLessons) {
        const date = day(lesson.lessonDate);
        const trial = child.convertedTrials.find((item) => item.lessonId === lesson.id);
        const record = child.attendanceRecords.find((item) => item.lessonId === lesson.id);
        const scheduled = child.groupMemberships.some((membership) => membership.groupId === group.id && isMemberOnDate(membership, lesson.lessonDate)) &&
          isLessonInChildPlan(child.attendancePlans, lesson.lessonDate);
        if (trial) statusByDate[date].push(trial.trialAttended === false ? "Пробное: не был" : trial.trialAttended === true ? "Пробное: был" : "Пробное: нет отметки");
        else if (scheduled || record) statusByDate[date].push(lesson.status === "CANCELLED" ? "Занятие отменено" : record?.status === "PRESENT" ? "Был" : record?.status === "ABSENT_UNEXCUSED" ? "Пропустил" : record?.status === "ABSENT_SICK_PENDING" ? "Болел" : "Нет отметки");
      }
      return { childId: child.id, childName: child.fullName, childStatus: child.status, groupId: group.id, groupName: group.name, branchName: group.branch.name,
        byDate: Object.fromEntries(dates.map((date) => [date, statusByDate[date].join("; ") || "—"])) };
    });
  });
  return {
    from: fromKey, to: toKey, dates, rows,
    groups: groups.map((group) => ({ id: group.id, name: group.name, branchId: group.branchId, branchName: group.branch.name, activeChildren: group.children.length, capacity: group.capacityLimit })),
    ignoredUngroupedChildren: children.filter((child) => child.currentGroupId === null && child.groupMemberships.length === 0 && child.attendanceRecords.length === 0 && child.convertedTrials.length === 0).length
  };
}
