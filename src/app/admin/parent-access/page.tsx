import { requireRole } from "@/server/auth/current-user";
import { listParentAccessByGroup } from "@/server/parents/parent-access-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { ParentAccessTable } from "./parent-access-table";

export default async function ParentAccessPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const rows = await listParentAccessByGroup(currentUser);
  return <div className="grid gap-5">
    <section className="panel p-5"><h1 className="text-2xl font-bold">Доступ родителей к личному кабинету</h1><p className="mt-2 text-sm text-[var(--muted)]">Текущий состав групп, активация и приглашения.</p></section>
    <ParentAccessTable rows={rows} />
  </div>;
}
