import { ScheduleForms } from "@/app/admin/schedule/components/schedule-forms";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { listCoaches } from "@/server/coaches/coach-service";
import { listGroups } from "@/server/groups/group-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listLessons, listScheduleTemplates } from "@/server/schedule/lesson-service";

const weekdayLabels = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function SchedulePage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [groups, coaches, scheduleTemplates, lessons] = await Promise.all([
    listGroups(currentUser),
    listCoaches(currentUser),
    listScheduleTemplates(currentUser),
    listLessons(currentUser)
  ]);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-02</p>
        <h1 className="mt-2 text-2xl font-bold">Расписание и занятия</h1>
      </section>

      <ScheduleForms groups={groups} coaches={coaches} lessons={lessons} />

      <section className="grid gap-4">
        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Шаблоны расписания</h2>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Группа</th>
                  <th>День</th>
                  <th>Время</th>
                  <th>Тренер</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {scheduleTemplates.map((template) => (
                  <tr key={template.id}>
                    <td className="font-semibold">{template.group.name}</td>
                    <td>{weekdayLabels[template.weekday]}</td>
                    <td>
                      {template.startTime}-{template.endTime}
                    </td>
                    <td>{template.coach.displayName}</td>
                    <td>
                      <StatusBadge status={template.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Занятия</h2>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Группа</th>
                  <th>Филиал</th>
                  <th>Тренер</th>
                  <th>Статус</th>
                  <th>Причина</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td className="font-semibold">
                      {lesson.lessonDate} {lesson.startTime}-{lesson.endTime}
                    </td>
                    <td>{lesson.group.name}</td>
                    <td>{lesson.branch.name}</td>
                    <td>
                      <div>{lesson.coach.displayName}</div>
                      {lesson.substituteCoach ? <div className="text-xs text-[var(--muted)]">Замена: {lesson.substituteCoach.displayName}</div> : null}
                    </td>
                    <td>
                      <StatusBadge status={lesson.status} />
                    </td>
                    <td>{lesson.changeReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
