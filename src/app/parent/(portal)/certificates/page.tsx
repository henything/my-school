import { FileCheck2 } from "lucide-react";
import { requireRole } from "@/server/auth/current-user";
import { getParentDocumentCenter } from "@/server/parents/parent-portal-service";
import { ParentDocumentList } from "../components/document-list";
import { CertificateUploadForm } from "../children/[id]/certificate-upload-form";

export default async function ParentCertificatesPage() {
  const currentUser = await requireRole(["PARENT"]);
  const center = await getParentDocumentCenter(currentUser);
  const pendingCount = center.children.reduce(
    (sum, child) => sum + child.medicalCertificates.filter((certificate) => certificate.status === "PENDING").length,
    0
  );

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Документы</p>
          <h1 className="mt-2 text-2xl font-bold">Справки</h1>
        </div>
        <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{pendingCount} на проверке</span>
      </section>

      <section className="grid gap-4">
        {center.children.map((child) => (
          <div key={child.id} className="panel">
            <PanelHeader
              title={child.fullName}
              subtitle={child.currentGroup?.name ?? "Без группы"}
              count={child.medicalCertificates.filter((certificate) => certificate.status === "PENDING").length}
            />
            <CertificateUploadForm childId={child.id} pendingSickness={child.pendingSickness} />
            <ParentDocumentList
              emptyText="Справок пока нет."
              items={child.medicalCertificates.map((certificate) => ({
                id: certificate.id,
                periodStart: certificate.periodStart,
                periodEnd: certificate.periodEnd,
                status: certificate.status,
                fileName: certificate.originalFileName,
                fileHref: `/api/medical-certificates/${certificate.id}/file`,
                comment: certificate.adminComment ?? certificate.comment,
                result: certificate.reviewedAt ? new Date(certificate.reviewedAt).toLocaleDateString("ru-RU") : null
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
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--green-soft)] text-[var(--success-strong)]">
          <FileCheck2 aria-hidden="true" size={18} />
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
