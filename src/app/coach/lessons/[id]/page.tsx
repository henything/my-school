import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { getCoachLessonDetail } from "@/server/attendance/attendance-service";
import { AttendanceForm } from "./attendance-form";
import { TrialPanel } from "./trial-panel";

export default async function CoachLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireRole(["COACH"]);
  const { id } = await params;
  const lesson = await getCoachLessonDetail(currentUser, id);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <Link href="/coach" className="inline-flex w-fit items-center gap-2 text-sm font-extrabold text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft aria-hidden="true" size={16} />
          Назад
        </Link>
        <div className="brand-hero flex flex-wrap items-start justify-between gap-4 px-5 pb-16 pt-6 sm:px-7">
          <div>
            <p className="text-sm font-extrabold uppercase text-white/75">Занятие</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.03] sm:text-5xl">{lesson.group.name}</h1>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-white/80">
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

      <TrialPanel lessonId={lesson.id} trials={lesson.trials} />
      <AttendanceForm lessonId={lesson.id} lessonChildren={lesson.children} />
    </div>
  );
}
