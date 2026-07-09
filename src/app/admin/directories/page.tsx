import { ChildTransferForm, DirectoryForms } from "@/app/admin/directories/components/directory-forms";
import { ParentAccountPanel } from "@/app/admin/directories/components/parent-account-panel";
import { RoleBadge, StatusBadge } from "@/components/badges";
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

      <section className="grid gap-4">
        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Группы</h2>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Филиал</th>
                  <th>Тренер</th>
                  <th>Статус</th>
                  <th>Заполненность</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td className="font-semibold">{group.name}</td>
                    <td>{group.branch.name}</td>
                    <td>{group.mainCoach.displayName}</td>
                    <td>
                      <StatusBadge status={group.status} />
                    </td>
                    <td>
                      <span className={group.isOverCapacity ? "font-bold text-[var(--warning)]" : "font-semibold"}>
                        {group.activeChildrenCount}/{group.capacityLimit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Дети</h2>
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ребёнок</th>
                  <th>Родитель</th>
                  <th>Группа</th>
                  <th>Статус</th>
                  <th>Допуск</th>
                  <th>Переносы</th>
                  <th>Перевод</th>
                </tr>
              </thead>
              <tbody>
                {children.map((child) => (
                  <tr key={child.id}>
                    <td className="font-semibold">{child.fullName}</td>
                    <td>
                      <div>{child.parent?.fullName ?? "—"}</div>
                      {child.parent?.phone ? <div className="text-xs text-[var(--muted)]">{child.parent.phone}</div> : null}
                    </td>
                    <td>{child.currentGroup?.name ?? "—"}</td>
                    <td>
                      <StatusBadge status={child.status} />
                    </td>
                    <td>
                      <RoleBadge role={child.admissionStatus} />
                    </td>
                    <td className="font-semibold">{child.cachedMakeupBalance}</td>
                    <td>
                      <ChildTransferForm childId={child.id} currentGroupId={child.currentGroup?.id ?? ""} groups={groups} />
                    </td>
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
