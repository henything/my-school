import { ScheduleForms } from "@/app/admin/schedule/components/schedule-forms";
import { ScheduleTables } from "@/app/admin/schedule/components/schedule-tables";
import { requireRole } from "@/server/auth/current-user";
import { listCoaches } from "@/server/coaches/coach-service";
import { listGroups } from "@/server/groups/group-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listLessons, listScheduleTemplates } from "@/server/schedule/lesson-service";

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

      <ScheduleTables scheduleTemplates={scheduleTemplates} lessons={lessons} />
    </div>
  );
}
