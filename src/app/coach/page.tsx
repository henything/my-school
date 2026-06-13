import Link from "next/link";
import { CalendarDays, ListChecks } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { TaskCloseForm } from "@/components/task-close-form";
import { requireRole } from "@/server/auth/current-user";
import { listCoachLessons } from "@/server/schedule/lesson-service";
import { listMyTasks, requiresCloseComment } from "@/server/tasks/task-service";

export default async function CoachPage() {
  const currentUser = await requireRole(["COACH"]);
  const lessons = await listCoachLessons(currentUser);
  const tasks = await listMyTasks(currentUser);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  const todayLessons = lessons.filter((lesson) => lesson.lessonDate === today);
  const futureLessons = lessons.filter((lesson) => lesson.lessonDate > today);
  const pastLessons = lessons.filter((lesson) => lesson.lessonDate < today).slice(-10).reverse();

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-03</p>
        <h1 className="mt-2 text-2xl font-bold">Кабинет тренера</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Сегодня, будущие и прошедшие занятия.
        </p>
      </section>

      <section className="grid gap-4">
        <LessonPanel title="Сегодня" lessons={todayLessons} empty="На сегодня занятий нет." />
        <LessonPanel title="Будущие" lessons={futureLessons} empty="Будущих занятий пока нет." />
        <LessonPanel title="Прошедшие" lessons={pastLessons} empty="Прошедших занятий пока нет." />
        <TaskPanel tasks={tasks} />
      </section>
    </div>
  );
}

function LessonPanel({
  title,
  lessons,
  empty
}: {
  title: string;
  lessons: Awaited<ReturnType<typeof listCoachLessons>>;
  empty: string;
}) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
        <CalendarDays className="text-[var(--accent)]" aria-hidden="true" size={18} />
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {lessons.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--muted)]">{empty}</p>
      ) : (
        <div className="grid gap-3 p-4">
          {lessons.map((lesson) => (
            <Link key={lesson.id} href={`/coach/lessons/${lesson.id}`} className="rounded-lg border border-[var(--line)] bg-white p-4 hover:border-[var(--accent)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{lesson.group.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {lesson.lessonDate} · {lesson.startTime}-{lesson.endTime} · {lesson.branch.name}
                  </p>
                  {lesson.substituteCoach ? <p className="mt-1 text-sm font-semibold text-[var(--accent-strong)]">Вы назначены на замену</p> : null}
                </div>
                <StatusBadge status={lesson.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskPanel({ tasks }: { tasks: Awaited<ReturnType<typeof listMyTasks>> }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
        <ListChecks className="text-[var(--accent)]" aria-hidden="true" size={18} />
        <h2 className="text-lg font-bold">Мои задачи</h2>
      </div>
      {tasks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--muted)]">Открытых задач нет.</p>
      ) : (
        <div className="grid gap-3 p-4">
          {tasks.map((task) => (
            <article key={task.id} className={task.priority === "CRITICAL" ? "rounded-lg border border-[#efb5ae] bg-[#fff4f2] p-4" : "rounded-lg border border-[var(--line)] bg-white p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{task.title}</h3>
                    <span className="badge bg-[#e6eff8] text-[#214f78]">{task.type}</span>
                  </div>
                  {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
                </div>
                <StatusBadge status={task.priority} />
              </div>
              <div className="mt-4">
                <TaskCloseForm taskId={task.id} requiresComment={requiresCloseComment(task)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
