import type { Prisma } from "@/generated/prisma/client";
import { dateToKey } from "@/server/schedule/generation";
import { isLessonInChildPlan, type AttendancePlan } from "./attendance-plan";

export type MembershipPeriod = { startDate: Date; endDate: Date | null };

// endDate is exclusive: a transfer on Wednesday belongs to the new group on Wednesday.
export function isMemberOnDate(membership: MembershipPeriod, date: Date) {
  const day = dateToKey(date);
  return dateToKey(membership.startDate) <= day &&
    (membership.endDate === null || day < dateToKey(membership.endDate));
}

export function childrenScheduledForLesson<T extends { id: string; fullName: string; attendancePlans: AttendancePlan[] }>(
  memberships: Array<MembershipPeriod & { child: T }>,
  attendanceRecords: Array<{ childId: string; child: T }>,
  lessonDate: Date
) {
  const children = new Map<string, T>();

  for (const membership of memberships) {
    if (isMemberOnDate(membership, lessonDate) && isLessonInChildPlan(membership.child.attendancePlans, lessonDate)) {
      children.set(membership.child.id, membership.child);
    }
  }

  // A recorded tabell remains visible after a later group transfer or attendance-plan change.
  for (const record of attendanceRecords) {
    children.set(record.childId, record.child);
  }

  return Array.from(children.values()).sort((left, right) => left.fullName.localeCompare(right.fullName, "ru"));
}

export async function setCurrentGroupMembership(
  tx: Prisma.TransactionClient,
  childId: string,
  groupId: string | null,
  effectiveDate: Date
) {
  const current = await tx.childGroupMembership.findFirst({
    where: { childId, endDate: null },
    orderBy: { startDate: "desc" }
  });

  if (current?.groupId === groupId) return;

  if (current && dateToKey(effectiveDate) < dateToKey(current.startDate)) {
    throw new Error("Дата изменения группы раньше начала текущего периода участия.");
  }

  if (current) {
    await tx.childGroupMembership.update({
      where: { id: current.id },
      data: { endDate: effectiveDate }
    });
  }

  if (groupId) {
    await tx.childGroupMembership.create({
      data: { childId, groupId, startDate: effectiveDate }
    });
  }
}
