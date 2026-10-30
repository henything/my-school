import { DirectoryForms } from "@/app/admin/directories/components/directory-forms";
import Link from "next/link";
import { DirectoryTables } from "@/app/admin/directories/components/directory-tables";
import { ParentAccountPanel } from "@/app/admin/directories/components/parent-account-panel";
import { WorkQueuePanel } from "@/components/work-queue-panel";
import { requireRole } from "@/server/auth/current-user";
import { listBranches } from "@/server/branches/branch-service";
import { listChildren } from "@/server/children/child-service";
import { listCoaches } from "@/server/coaches/coach-service";
import { listGroups } from "@/server/groups/group-service";
import { listParentAccounts } from "@/server/parents/parent-auth-service";
import { listParents } from "@/server/parents/parent-service";
import { ADMIN_ROLES, canCreateCoach } from "@/server/rbac/rbac";
import { listTasks } from "@/server/tasks/task-service";
import { listLessons } from "@/server/schedule/lesson-service";
import { listTrials } from "@/server/trials/trial-service";

export default async function DirectoriesPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [branches, coaches, groups, parents, parentAccounts, children, tasks, lessons, trials] = await Promise.all([
    listBranches(currentUser),
    listCoaches(currentUser),
    listGroups(currentUser),
    listParents(currentUser),
    listParentAccounts(currentUser),
    listChildren(currentUser),
    listTasks(currentUser),
    listLessons(currentUser),
    listTrials(currentUser)
  ]);

  const overCapacityTasks = tasks.filter((task) => task.type === "GROUP_OVER_CAPACITY");

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="mt-2 text-2xl font-bold">Справочники школы</h1>
        <Link href="/admin/parent-access" className="mt-2 inline-block text-sm font-bold text-[var(--accent-strong)]">Доступ родителей к ЛК →</Link>
        <Link href="/admin/cleanup" className="ml-4 mt-2 inline-block text-sm font-bold text-[var(--accent-strong)]">Дубли и тестовые записи →</Link>
      </section>

      <WorkQueuePanel
        title="Переполненные группы"
        subtitle="Группы сверх лимита требуют решения до новых зачислений или переводов."
        tasks={overCapacityTasks}
        tone="warning"
      />

      <DirectoryTables branches={branches} groups={groups} coaches={coaches} childRows={children}>
        <DirectoryForms
          canCreateCoach={canCreateCoach(currentUser)}
          branches={branches}
          coaches={coaches}
          groups={groups}
          parents={parents}
          lessons={lessons}
          trials={trials}
        />
        <ParentAccountPanel parents={parents} accounts={parentAccounts} />
      </DirectoryTables>
    </div>
  );
}
