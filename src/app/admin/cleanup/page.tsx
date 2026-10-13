import { requireRole } from "@/server/auth/current-user";
import { listParents } from "@/server/parents/parent-service";
import { listChildren } from "@/server/children/child-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { CleanupPanel } from "./cleanup-panel";

export default async function CleanupPage() {
  const user = await requireRole(ADMIN_ROLES);
  const [parents, children] = await Promise.all([listParents(user), listChildren(user)]);
  return <div className="grid gap-5"><section className="panel p-5"><h1 className="text-2xl font-bold">Дубли и тестовые записи</h1><p className="mt-2 text-sm text-[var(--muted)]">Перед архивированием и объединением проверьте детей, табели, счета и платежи. Финансовые записи сохраняются.</p></section><CleanupPanel parents={parents} childRows={children} /></div>;
}
