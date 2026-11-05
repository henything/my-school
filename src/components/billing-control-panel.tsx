import Link from "next/link";
import { formatDate } from "@/lib/date-format";
import type { CurrentUser } from "@/server/auth/current-user";
import { getBillingControl } from "@/server/billing/control-service";
import { BillingSicknessDecision } from "@/components/billing-sickness-decision";

const labels = {
  MISSING_INVOICE: "Нет счёта", MISMATCH: "Проверить начисление", INVALID_WEEKDAY: "График не совпадает", PENDING_CERTIFICATE: "Разобрать справку"
};

export async function BillingControlPanel({ currentUser }: { currentUser: CurrentUser }) {
  const { month, items } = await getBillingControl(currentUser);
  const overdue = items.filter((item) => item.overdue).length;
  return (
    <section className="panel min-w-0 border-[var(--warning-strong)] p-5" aria-labelledby="billing-control-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="billing-control-heading" className="text-xl font-bold">Контроль начислений · {month}</h2>
        <span className="badge bg-[var(--yellow-soft)] text-[var(--warning-strong)]">Требуют внимания: {items.length}{overdue ? ` · Просрочено: ${overdue}` : ""}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">Проверка текущего месяца по всем активным детям и неразобранных болезней за все даты. Счета и посещаемость сами не меняются. Просроченные пункты остаются здесь до устранения причины.</p>
      {items.length === 0 ? <p className="mt-4 text-sm">Расхождений не обнаружено.</p> : (
        <div className="mt-4 max-h-[36rem] space-y-3 overflow-y-auto pr-1" role="region" aria-label="Расхождения начислений" tabIndex={0}>
          {items.map((item) => <article key={item.id} className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-bold">{item.childName} · {labels[item.kind]}</h3>
              {item.overdue ? <span className="text-sm font-bold text-[var(--danger)]">Требует решения: срок истёк</span> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.groupName}</p>
            <p className="mt-2 text-sm">{item.detail}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Ответственный: {item.assignee} · Срок: {formatDate(item.dueAt)}</p>
            <Link href={item.href} className="mt-2 inline-block text-sm font-semibold underline">{item.kind === "PENDING_CERTIFICATE" ? "Посмотреть справки и переносы" : item.kind === "INVALID_WEEKDAY" ? "Открыть справочники" : "Открыть счета и пересчёт"}</Link>
            {item.attendanceRecordId ? <BillingSicknessDecision attendanceRecordId={item.attendanceRecordId} childName={item.childName} /> : null}
          </article>)}
        </div>
      )}
    </section>
  );
}
