import Link from "next/link";
import { requireRole } from "@/server/auth/current-user";
import { listDiscrepancies } from "@/server/analytics/discrepancy-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export default async function DiscrepanciesPage() {
  const user = await requireRole(ADMIN_ROLES);
  const issues = await listDiscrepancies(user);
  return <div className="grid gap-5"><section className="panel p-5"><h1 className="text-2xl font-bold">Расхождения, требующие проверки</h1><p className="mt-2 text-sm text-[var(--muted)]">Пробные, даты карточек, табели, счета и остатки после ухода.</p></section>
    <section className="panel overflow-x-auto"><table className="data-table min-w-[750px]"><thead><tr><th>Ситуация</th><th>Ребёнок</th><th>Что проверить</th><th>Перейти</th></tr></thead><tbody>{issues.map((issue, index) => <tr key={index}><td className="font-bold">{issue.kind}</td><td>{issue.childName}</td><td>{issue.detail}</td><td><Link className="font-bold text-[var(--accent-strong)]" href={issue.href}>Открыть</Link></td></tr>)}{issues.length === 0 ? <tr><td colSpan={4}>Расхождений нет.</td></tr> : null}</tbody></table></section>
  </div>;
}
