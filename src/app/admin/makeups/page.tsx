import { MakeupForms } from "@/app/admin/makeups/components/makeup-forms";
import { requireRole } from "@/server/auth/current-user";
import { listChildren } from "@/server/children/child-service";
import { listGroups } from "@/server/groups/group-service";
import { listGroupEvents, listMakeups, listPendingSickness } from "@/server/makeups/makeup-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listLessons } from "@/server/schedule/lesson-service";
import { listTasks } from "@/server/tasks/task-service";

const taskTypes = new Set(["CERTIFICATE_PENDING", "SICKNESS_FOLLOW_UP", "MAKEUP_NEEDS_ASSIGNMENT"]);

export default async function MakeupsPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [children, groups, lessons, makeups, pendingSickness, groupEvents, tasks] = await Promise.all([
    listChildren(currentUser),
    listGroups(currentUser),
    listLessons(currentUser),
    listMakeups(currentUser),
    listPendingSickness(currentUser),
    listGroupEvents(currentUser),
    listTasks(currentUser)
  ]);
  const operationalTasks = tasks.filter((task) => taskTypes.has(task.type));

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-05</p>
        <h1 className="mt-2 text-2xl font-bold">Болезни, отпуска и переносы</h1>
      </section>

      {operationalTasks.length > 0 ? (
        <section className="panel border-[#efc27a] bg-[#fff8ec] p-5">
          <h2 className="text-lg font-bold text-[#7a3f0d]">Операционные задачи</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {operationalTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-[#efc27a] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-[#f7e4d1] text-[#7a3f0d]">{task.priority}</span>
                  <span className="badge bg-[#e6eff8] text-[#214f78]">{task.type}</span>
                  <span className="font-semibold">{task.title}</span>
                </div>
                {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MakeupForms
        childOptions={children}
        groups={groups}
        lessons={lessons}
        makeups={makeups}
        pendingSickness={pendingSickness}
        groupEvents={groupEvents}
      />
    </div>
  );
}
