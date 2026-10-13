import Link from "next/link";
import { requireRole } from "@/server/auth/current-user";
import { getAttendanceReport } from "@/server/analytics/attendance-report-service";
import { listGroups } from "@/server/groups/group-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

type Params = { from?: string; to?: string; branchId?: string; groupId?: string };

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  const currentUser = await requireRole(ADMIN_ROLES);
  const filters = await searchParams;
  const [report, allGroups] = await Promise.all([getAttendanceReport(currentUser, filters), listGroups(currentUser)]);
  const branches = Array.from(new Map(allGroups.map((group) => [group.branch.id, group.branch.name])).entries());
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)).toString();

  return <div className="grid gap-5">
    <section className="panel p-5"><h1 className="text-2xl font-bold">Посещаемость по дням</h1><p className="mt-2 text-sm text-[var(--muted)]">Все дети групп за период, включая тех, у кого нет отметок. Пустая отметка не считается пропуском.</p></section>
    <form className="panel grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5" method="get">
      <label className="label">С<input className="field" name="from" type="date" defaultValue={report.from} required /></label>
      <label className="label">По<input className="field" name="to" type="date" defaultValue={report.to} required /></label>
      <label className="label">Филиал<select className="field" name="branchId" defaultValue={filters.branchId ?? ""}><option value="">Все</option>{branches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="label">Группа<select className="field" name="groupId" defaultValue={filters.groupId ?? ""}><option value="">Все</option>{allGroups.map((group) => <option key={group.id} value={group.id}>{group.branch.name} · {group.name}</option>)}</select></label>
      <button className="min-h-11 self-end rounded-lg bg-[var(--brand-yellow)] px-4 font-bold" type="submit">Показать</button>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Детей в отчёте: {report.rows.length} · Дней с занятиями: {report.dates.length}</p><Link href={`/api/admin/attendance-report/export?${query}`} className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold">Скачать Excel</Link></div>
    <section className="panel overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Филиал</th><th>Группа</th><th>Ребёнок</th>{report.dates.map((date) => <th key={date}>{date}</th>)}</tr></thead><tbody>
      {report.rows.map((row) => <tr key={`${row.groupId}:${row.childId}`}><td>{row.branchName}</td><td>{row.groupName}</td><td className="font-bold">{row.childName}</td>{report.dates.map((date) => <td key={date}>{row.byDate[date]}</td>)}</tr>)}
      {report.rows.length === 0 ? <tr><td colSpan={Math.max(3, report.dates.length + 3)}>Детей за выбранный период нет.</td></tr> : null}
    </tbody></table></section>
    <section className="panel overflow-x-auto p-5"><h2 className="mb-3 text-lg font-bold">Загрузка групп сейчас</h2><table className="data-table"><thead><tr><th>Филиал</th><th>Группа</th><th>Детей</th><th>Мест</th></tr></thead><tbody>{report.groups.map((group) => <tr key={group.id}><td>{group.branchName}</td><td>{group.name}</td><td>{group.activeChildren}</td><td>{group.capacity}</td></tr>)}</tbody></table></section>
  </div>;
}
