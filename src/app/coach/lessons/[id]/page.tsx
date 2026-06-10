import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { getCoachLessonDetail } from "@/server/attendance/attendance-service";
import { AttendanceForm } from "./attendance-form";

export default async function CoachLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireRole(["COACH"]);
  const { id } = await params;
  const lesson = await getCoachLessonDetail(currentUser, id);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <Link href="/coach" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft aria-hidden="true" size={16} />
          Назад
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-03</p>
            <h1 className="mt-2 text-2xl font-bold">{lesson.group.name}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays aria-hidden="true" size={15} />
                {lesson.lessonDate} · {lesson.startTime}-{lesson.endTime}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" size={15} />
                {lesson.branch.name}
              </span>
            </div>
          </div>
          <StatusBadge status={lesson.status} />
        </div>
      </section>

      <AttendanceForm lessonId={lesson.id} lessonChildren={lesson.children} />
    </div>
  );
}
