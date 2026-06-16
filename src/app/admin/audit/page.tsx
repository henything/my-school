import { History } from "lucide-react";
import { requireRole } from "@/server/auth/current-user";
import { listAuditLogs } from "@/server/audit/audit-log-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export default async function AuditLogPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const auditLogs = await listAuditLogs(currentUser);

  return (
    <div className="grid gap-6">
      <section className="min-w-0">
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-09</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Журнал аудита</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Последние критичные действия по школе. Записи доступны только для чтения.
            </p>
          </div>
          <span className="badge bg-[#e6eff8] text-[#214f78]">Записей: {auditLogs.length}</span>
        </div>
      </section>

      <section className="panel min-w-0">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
          <History className="text-[var(--accent)]" aria-hidden="true" size={18} />
          <h2 className="text-lg font-bold">События</h2>
        </div>
        <div className="table-shell">
          <table className="data-table min-w-[1180px]">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>Актор</th>
                <th>Комментарий</th>
                <th>До</th>
                <th>После</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td className="font-semibold">{log.action}</td>
                  <td>
                    <div className="font-semibold">{log.entityType}</div>
                    <div className="text-xs text-[var(--muted)]">{log.entityId ?? "—"}</div>
                  </td>
                  <td>
                    <div className="font-semibold">{log.actor?.displayName ?? "Система"}</div>
                    <div className="text-xs text-[var(--muted)]">{log.actor?.role ?? "—"}</div>
                  </td>
                  <td>{log.comment ?? "—"}</td>
                  <td>
                    <JsonPreview value={log.oldValue} />
                  </td>
                  <td>
                    <JsonPreview value={log.newValue} />
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)]">
                    Записей пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  return (
    <pre className="max-h-36 min-w-[220px] overflow-auto rounded-lg bg-[#f8faf8] p-3 text-xs leading-5 text-[var(--foreground)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
