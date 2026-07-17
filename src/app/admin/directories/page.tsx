import { DirectoryForms } from "@/app/admin/directories/components/directory-forms";
import { DirectoryTables } from "@/app/admin/directories/components/directory-tables";
import { ParentAccountPanel } from "@/app/admin/directories/components/parent-account-panel";
import { requireRole } from "@/server/auth/current-user";
import { listBranches } from "@/server/branches/branch-service";
import { listChildren } from "@/server/children/child-service";
import { listCoaches } from "@/server/coaches/coach-service";
import { listGroups } from "@/server/groups/group-service";
import { listParentAccounts } from "@/server/parents/parent-auth-service";
import { listParents } from "@/server/parents/parent-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listTasks } from "@/server/tasks/task-service";

export default async function DirectoriesPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [branches, coaches, groups, parents, parentAccounts, children, tasks] = await Promise.all([
    listBranches(currentUser),
    listCoaches(currentUser),
    listGroups(currentUser),
    listParents(currentUser),
    listParentAccounts(currentUser),
    listChildren(currentUser),
    listTasks(currentUser)
  ]);

  const overCapacityTasks = tasks.filter((task) => task.type === "GROUP_OVER_CAPACITY");

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-01</p>
        <h1 className="mt-2 text-2xl font-bold">Справочники школы</h1>
      </section>

      {overCapacityTasks.length > 0 ? (
        <section className="panel border-[#efc27a] bg-[#fff8ec] p-5">
          <h2 className="text-lg font-bold text-[#7a3f0d]">Задачи по переполненным группам</h2>
          <div className="mt-4 grid gap-3">
            {overCapacityTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-[#efc27a] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-[#f7e4d1] text-[#7a3f0d]">{task.priority}</span>
                  <span className="font-semibold">{task.title}</span>
                </div>
                {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <DirectoryForms
        canCreateCoach={currentUser.role === "SUPER_ADMIN"}
        branches={branches}
        coaches={coaches}
        groups={groups}
        parents={parents}
      />

      <ParentAccountPanel parents={parents} accounts={parentAccounts} />

      <DirectoryTables groups={groups} children={children} />
    </div>
  );
}
