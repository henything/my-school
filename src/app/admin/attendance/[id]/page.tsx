import Link from "next/link";
import { AttendanceForm } from "@/app/coach/lessons/[id]/attendance-form";
import { StatusBadge } from "@/components/badges";
import { formatLessonDateTime } from "@/lib/date-format";
import { requireRole } from "@/server/auth/current-user";
import { getCoachLessonDetail, calculateAge } from "@/server/attendance/attendance-service";
import { listChildren } from "@/server/children/child-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export default async function AdminAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireRole(ADMIN_ROLES);
  const { id } = await params;
  const [lesson, children] = await Promise.all([getCoachLessonDetail(currentUser, id), listChildren(currentUser)]);
  const rosterIds = new Set(lesson.children.map((child) => child.id));
  const extraChildren = children
    .filter((child) => !rosterIds.has(child.id) &&
      (child.currentGroup?.id === lesson.group.id || child.groupMemberships.some((membership) => membership.groupId === lesson.group.id)))
    .map((child) => ({
      id: child.id,
      fullName: child.fullName,
      age: child.birthDate ? calculateAge(new Date(`${child.birthDate}T00:00:00.000Z`), new Date(`${lesson.lessonDate}T00:00:00.000Z`)) : null,
      medicalNotes: child.medicalNotes,
      coachComment: child.coachComment,
      adminComment: child.adminComment,
      admissionStatus: child.admissionStatus,
      parent: child.parent,
      attendance: { status: "NOT_MARKED" as const, comment: null }
    }));

  return (
    <div className="grid gap-6">
      <Link href="/admin/schedule" className="w-fit text-sm font-bold text-[var(--accent-strong)]">← К расписанию</Link>
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-bold">Табель: {lesson.group.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{formatLessonDateTime(lesson.lessonDate, lesson.startTime, lesson.endTime)} · {lesson.branch.name}</p>
        </div>
        <StatusBadge status={lesson.status} />
      </section>
      <AttendanceForm
        key={`${lesson.id}-${lesson.children.map((child) => `${child.id}:${child.attendance.status}`).join(",")}`}
        lessonId={lesson.id}
        lessonChildren={lesson.children}
        extraChildren={extraChildren}
        adminMode
      />
    </div>
  );
}
