import { CalendarDays, FileText, History, RefreshCcw, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { labelForEnum } from "@/lib/labels";
import { requireRole } from "@/server/auth/current-user";
import { getParentChildDetail } from "@/server/parents/parent-portal-service";
import { CertificateUploadForm } from "./certificate-upload-form";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

type ParentChildPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ParentChildPage({ params }: ParentChildPageProps) {
  const currentUser = await requireRole(["PARENT"]);
  const { id } = await params;
  const child = await getParentChildDetail(currentUser, id);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">{child.currentGroup?.name ?? "Без группы"}</p>
        <h1 className="mt-2 text-2xl font-bold">{child.fullName}</h1>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryPanel title="Допуск" value={parentAdmissionLabel(child.admissionStatus)} />
        <SummaryPanel title="Остаток занятий" value={`${child.lessonBalance}`} />
        <SummaryPanel title="Переносы" value={`${child.makeupBalance}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <PanelHeader icon={<CalendarDays aria-hidden="true" size={18} />} title="Ближайшие занятия" />
          <div className="grid gap-3 p-5">
            {child.upcomingLessons.length > 0 ? (
              child.upcomingLessons.map((lesson) => (
                <div key={lesson.id} className="rounded-lg border border-[var(--line)] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">
                      {formatDate(lesson.lessonDate)} · {lesson.startTime}-{lesson.endTime}
                    </div>
                    <StatusBadge status={lesson.status} />
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {lesson.branch.name} · {lesson.coachName}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text="Ближайших занятий нет." />
            )}
          </div>
        </div>

        <div className="panel">
          <PanelHeader icon={<WalletCards aria-hidden="true" size={18} />} title="Абонемент и счета" />
          <div className="grid gap-3 p-5">
            {child.latestSubscription ? (
              <div className="rounded-lg border border-[var(--line)] px-4 py-3">
                <div className="font-bold">
                  {child.latestSubscription.periodStart} - {child.latestSubscription.periodEnd}
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {child.latestSubscription.plannedLessonsCount} занятий · {formatKopeks(child.latestSubscription.totalAmountKopeks)}
                </div>
                <div className="mt-3">
                  <StatusBadge status={child.latestSubscription.paymentStatus} />
                </div>
              </div>
            ) : (
              <EmptyState text="Абонемент ещё не создан." />
            )}

            {child.openInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-lg border border-[#ffe08a] bg-[var(--yellow-soft)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold">Счёт {invoice.number}</div>
                  <StatusBadge status={invoice.status} />
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  К оплате {formatKopeks(invoice.remainingAmountKopeks)} до {invoice.dueDate}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <PanelHeader icon={<History aria-hidden="true" size={18} />} title="История посещений" />
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Статус</th>
                  <th>Занятие</th>
                </tr>
              </thead>
              <tbody>
                {child.attendance.map((record) => (
                  <tr key={record.id}>
                    <td>{record.lessonDate}</td>
                    <td>
                      <StatusBadge status={record.finalStatus ?? record.status} />
                    </td>
                    <td>
                      {record.startTime}-{record.endTime}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {child.attendance.length === 0 ? <EmptyState text="Истории посещений пока нет." /> : null}
          </div>
        </div>

        <div className="panel">
          <PanelHeader icon={<RefreshCcw aria-hidden="true" size={18} />} title="Переносы" />
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Причина</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {child.makeups.map((makeup) => (
                  <tr key={makeup.id}>
                    <td>{labelForEnum(makeup.reason)}</td>
                    <td>
                      <StatusBadge status={makeup.status} />
                    </td>
                    <td>{makeup.assignedDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {child.makeups.length === 0 ? <EmptyState text="Переносов пока нет." /> : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={<FileText aria-hidden="true" size={18} />} title="Справки" />
        <CertificateUploadForm childId={child.id} pendingSickness={child.pendingSickness} />
        <div className="table-shell">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Период</th>
                <th>Статус</th>
                <th>Файл</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {child.medicalCertificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>
                    {certificate.periodStart} - {certificate.periodEnd}
                  </td>
                  <td>
                    <StatusBadge status={certificate.status} />
                  </td>
                  <td>
                    <a className="font-semibold text-[var(--accent-strong)]" href={`/api/medical-certificates/${certificate.id}/file`} target="_blank">
                      {certificate.originalFileName}
                    </a>
                  </td>
                  <td>{certificate.adminComment ?? certificate.comment ?? "—"}</td>
                </tr>
              ))}
              {child.medicalCertificates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--muted)]">
                    Справок пока нет.
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

function SummaryPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="panel p-5">
      <div className="text-sm font-semibold text-[var(--muted)]">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
      {icon}
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-5 text-sm font-semibold text-[var(--muted)]">{text}</div>;
}

function parentAdmissionLabel(status: string) {
  if (status === "ADMITTED") {
    return "Можно посещать";
  }

  if (status === "CREDIT_LESSON_USED") {
    return "Есть занятие в долг";
  }

  return "Нужна оплата";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

function formatKopeks(value: number) {
  return rubFormatter.format(value / 100);
}
