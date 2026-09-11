import { Plane } from "lucide-react";
import { requireRole } from "@/server/auth/current-user";
import { getParentDocumentCenter } from "@/server/parents/parent-portal-service";
import { ParentDocumentList } from "../components/document-list";
import { VacationRequestForm } from "../children/[id]/vacation-request-form";

export default async function ParentVacationsPage() {
  const currentUser = await requireRole(["PARENT"]);
  const center = await getParentDocumentCenter(currentUser);
  const pendingCount = center.children.reduce(
    (sum, child) => sum + child.vacationRequests.filter((request) => request.status === "PENDING").length,
    0
  );

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Документы</p>
          <h1 className="mt-2 text-2xl font-bold">Отпуск</h1>
        </div>
        <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{pendingCount} на проверке</span>
      </section>

      <section className="grid gap-4">
        {center.children.map((child) => (
          <div key={child.id} className="panel">
            <PanelHeader
              title={child.fullName}
              subtitle={child.currentGroup?.name ?? "Без группы"}
              count={child.vacationRequests.filter((request) => request.status === "PENDING").length}
            />
            <VacationRequestForm childId={child.id} />
            <ParentDocumentList
              emptyText="Заявлений на отпуск пока нет."
              items={child.vacationRequests.map((request) => ({
                id: request.id,
                periodStart: request.periodStart,
                periodEnd: request.periodEnd,
                status: request.status,
                fileName: request.originalFileName,
                fileHref: `/api/vacation-requests/${request.id}/file`,
                comment: request.adminComment ?? request.comment,
                result: request.status === "APPROVED" ? `Переносов: ${request.makeupCount ?? 0}` : null
              }))}
            />
          </div>
        ))}
        {center.children.length === 0 ? <div className="panel p-5 text-sm font-semibold text-[var(--muted)]">Детей пока нет.</div> : null}
      </section>
    </div>
  );
}

function PanelHeader({ title, subtitle, count }: { title: string; subtitle: string; count: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--yellow-soft)] text-[var(--warning-strong)]">
          <Plane aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
      <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{count} на проверке</span>
    </div>
  );
}
