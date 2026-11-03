import { benefitLabel, benefitStatusLabels } from "@/lib/benefits";
import { Phone, UserCircle } from "lucide-react";
import { requireRole } from "@/server/auth/current-user";
import { getParentDashboard } from "@/server/parents/parent-portal-service";

export default async function ParentProfilePage() {
  const currentUser = await requireRole(["PARENT"]);
  const dashboard = await getParentDashboard(currentUser);

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Кабинет родителя</p>
        <h1 className="mt-2 text-2xl font-bold">Профиль</h1>
      </section>

      <section className="panel p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
            <UserCircle aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{dashboard.parent.fullName ?? "Родитель"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--muted)]">
              <Phone aria-hidden="true" size={16} />
              {dashboard.parent.phone ?? "Телефон не указан"}
            </div>
          </div>
        </div>

        {dashboard.parent.benefitCategory ? <div className="mt-5 rounded-lg border border-[var(--line)] p-4 text-sm"><h3 className="font-bold">Скидка на абонемент</h3><p>{benefitLabel(dashboard.parent.benefitCategory)} · {benefitStatusLabels[dashboard.parent.benefitStatus]}</p>
          <p className="mt-2 text-[var(--muted)]">{dashboard.parent.benefitStatus === "APPROVED" ? "Скидка 10% подтверждена без срока окончания и применяется к новым счетам." : dashboard.parent.benefitEvidenceId ? "С документом скидка 10% предоставляется за первый расчётный месяц. Для следующих месяцев требуется подтверждение администратора. При отказе первый месяц не пересчитывается." : "Чтобы скидка применялась, требуется подтверждение администратора."}</p>
          {dashboard.parent.benefitFirstInvoiceMonth ? <p className="mt-2">Первый месяц со скидкой: {new Date(dashboard.parent.benefitFirstInvoiceMonth + "T12:00:00Z").toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })}.</p> : null}
          {dashboard.parent.benefitEvidenceId ? <a className="mt-2 inline-block underline" href={`/api/parents/${dashboard.parent.id}/benefit/file`}>Скачать прикреплённый документ</a> : null}
          {dashboard.parent.benefitReviewComment ? <p className="mt-2">Комментарий администратора: {dashboard.parent.benefitReviewComment}</p> : null}</div> : null}
        <div className="mt-6 grid gap-3">
          <h3 className="font-bold">Дети</h3>
          {dashboard.children.map((child) => (
            <div key={child.id} className="rounded-lg border border-[var(--line)] px-4 py-3">
              <div className="font-semibold">{child.fullName}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{child.currentGroup?.name ?? "Без группы"}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
