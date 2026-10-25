import { AlertTriangle, BarChart3, ClipboardCheck, Coins, Percent, Receipt, TrendingUp, UserRoundX, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/server/auth/current-user";
import { getAnalyticsDashboard } from "@/server/analytics/analytics-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const currentUser = await requireRole(ADMIN_ROLES);
  const analytics = await getAnalyticsDashboard(currentUser, await searchParams);

  const topMetrics = [
    {
      label: "Оплаченные абонементы",
      value: `${analytics.totals.paidPercent}%`,
      detail: "доля абонементов со статусом оплаты",
      icon: ClipboardCheck,
      tone: "success"
    },
    {
      label: "Средний чек",
      value: money(analytics.totals.averageReceiptKopeks),
      detail: "средний успешный платёж за период",
      icon: Receipt,
      tone: "info"
    },
    {
      label: "Должники",
      value: analytics.totals.debtorCount.toString(),
      detail: "родители с непогашенными счетами",
      icon: UserRoundX,
      tone: analytics.totals.debtorCount > 0 ? "danger" : "success"
    },
    {
      label: "Конверсия пробников",
      value: `${analytics.totals.trialConversionPercent}%`,
      detail: `${analytics.totals.convertedTrialCount} из ${analytics.totals.trialCount}`,
      icon: TrendingUp,
      tone: "warning"
    },
    {
      label: "Незаполненные табели",
      value: analytics.totals.attendanceNotFilledCount.toString(),
      detail: "открытые задачи по посещаемости",
      icon: AlertTriangle,
      tone: analytics.totals.attendanceNotFilledCount > 0 ? "danger" : "success"
    }
  ] as const;

  return (
    <div className="grid gap-6">
      <section className="brand-hero px-5 pb-20 pt-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-white/75">Аналитика</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.03] sm:text-5xl">Финансы, группы и загрузка</h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/80">Сводка по приходу, долгам, ученикам, группам и тренерским начислениям.</p>
          </div>
          <span className="brand-pill">Для ADMIN и SUPER_ADMIN</span>
        </div>
      </section>

      <form className="relative z-10 -mt-14 panel grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]" method="get">
        <label className="label">Платежи с<input className="field" name="from" type="date" defaultValue={analytics.period.from} required /></label>
        <label className="label">По<input className="field" name="to" type="date" defaultValue={analytics.period.to} required /></label>
        <button className="min-h-11 self-end rounded-lg bg-[var(--brand-yellow)] px-5 font-bold" type="submit">Показать</button>
      </form>
      <p className="text-sm text-[var(--muted)]">Период по московскому времени. Учитываются успешные платежи, сохранённые в системе. Комиссия ЮKassa — фактическая разница между платежом и суммой после удержаний.</p>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Оплатили родители" value={money(analytics.receipt.grossKopeks)} detail="успешные платежи за выбранный период" icon={Coins} tone="success" />
        <MetricCard label="Удержала ЮKassa" value={analytics.receipt.feeKopeks === null ? "Нет данных" : money(analytics.receipt.feeKopeks)} detail="комиссия по платежам ЮKassa, включая НДС" icon={Percent} tone="warning" />
        <MetricCard label="После удержаний" value={analytics.receipt.netKopeks === null ? "Нет данных" : money(analytics.receipt.netKopeks)} detail="платежи за вычетом комиссии ЮKassa; дата выплаты на счёт может отличаться" icon={WalletCards} tone="info" />
        <MetricCard label="Общая сумма долга" value={money(analytics.totals.totalDebtAmountKopeks)} detail="текущий остаток, вне выбранного периода" icon={WalletCards} tone={analytics.totals.totalDebtAmountKopeks > 0 ? "danger" : "success"} />
        <MetricCard label="Общее кол-во человек" value={analytics.totals.totalActiveChildren.toString()} detail="активные дети сейчас" icon={UsersRound} tone="info" />
        <MetricCard label="Наполняемость групп" value={`${analytics.totals.fillPercent}%`} detail="текущая загрузка" icon={Percent} tone="warning" />
      </section>
      {analytics.receipt.unknownFeeCount > 0 ? <p className="rounded-lg border border-[var(--danger)]/30 bg-white p-4 text-sm font-semibold text-[var(--danger)]">У {analytics.receipt.unknownFeeCount} платежей ЮKassa нет достоверной суммы после удержаний. Комиссия и итог не рассчитаны; проверьте данные этих платежей.</p> : null}
      <Link href="/admin/attendance-report" className="w-fit rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold">Отчёт по посещаемости и выгрузка Excel →</Link>
      <Link href="/admin/discrepancies" className="w-fit rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-bold">Расхождения, требующие проверки →</Link>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {topMetrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} icon={metric.icon} tone={metric.tone} compact />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <MoneyPanel title="Оплатили родители по группам · за период" rows={analytics.receiptByGroup} emptyLabel="Успешных платежей за период нет." />
        <MoneyPanel title="Долг по группам · сейчас" rows={analytics.debtByGroup} emptyLabel="Непогашенных долгов нет." />
      </section>

      <DataPanel title="Группы">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Группа</th>
              <th>Филиал</th>
              <th>Тренер</th>
              <th>Людей</th>
              <th>Наполняемость</th>
              <th>Оплатили за период</th>
              <th>Долг сейчас</th>
            </tr>
          </thead>
          <tbody>
            {analytics.groupRows.map((group) => (
              <tr key={group.id}>
                <td className="font-semibold">{group.name}</td>
                <td>{group.branchName}</td>
                <td>{group.coachName}</td>
                <td className="font-semibold">
                  {group.activeChildrenCount}/{group.capacityLimit}
                </td>
                <td className="font-semibold">{group.fillPercent}%</td>
                <td>{money(group.receiptAmountKopeks)}</td>
                <td className={group.debtAmountKopeks > 0 ? "font-bold text-[var(--danger)]" : undefined}>{money(group.debtAmountKopeks)}</td>
              </tr>
            ))}
            {analytics.groupRows.length === 0 ? <EmptyTableRow colSpan={7} label="Группы пока не созданы." /> : null}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Зарплата тренеров">
        <table className="data-table">
          <thead>
            <tr>
              <th>Тренер</th>
              <th>Сумма абонементов</th>
              <th>25%</th>
            </tr>
          </thead>
          <tbody>
            {analytics.coachRows.map((coach) => (
              <tr key={coach.coachId}>
                <td className="font-semibold">{coach.coachName}</td>
                <td>{money(coach.subscriptionAmountKopeks)}</td>
                <td className="font-bold">{money(coach.salaryAmountKopeks)}</td>
              </tr>
            ))}
            {analytics.coachRows.length === 0 ? <EmptyTableRow colSpan={3} label="Абонементов для расчёта зарплаты пока нет." /> : null}
          </tbody>
        </table>
      </DataPanel>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  compact = false
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof BarChart3;
  tone: "success" | "warning" | "danger" | "info";
  compact?: boolean;
}) {
  return (
    <div className="metric-card grid gap-3 p-4" data-tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-bold text-[var(--muted)]">{label}</span>
        <Icon aria-hidden="true" className="shrink-0 text-[var(--accent)]" size={18} />
      </div>
      <span className={compact ? "text-2xl font-extrabold" : "text-3xl font-extrabold"}>{value}</span>
      {detail ? <span className="text-xs font-semibold leading-5 text-[var(--muted)]">{detail}</span> : null}
    </div>
  );
}

function MoneyPanel({ title, rows, emptyLabel }: { title: string; rows: Array<{ groupId: string | null; groupName: string; branchName: string | null; amountKopeks: number }>; emptyLabel: string }) {
  return (
    <DataPanel title={title}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Группа</th>
            <th>Филиал</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.groupId ?? "none"}>
              <td className="font-semibold">{row.groupName}</td>
              <td>{row.branchName ?? "-"}</td>
              <td className="font-bold">{money(row.amountKopeks)}</td>
            </tr>
          ))}
          {rows.length === 0 ? <EmptyTableRow colSpan={3} label={emptyLabel} /> : null}
        </tbody>
      </table>
    </DataPanel>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4">
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      <div className="table-shell">{children}</div>
    </section>
  );
}

function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-sm font-semibold text-[var(--muted)]">
        {label}
      </td>
    </tr>
  );
}

function money(kopeks: number) {
  return rubFormatter.format(kopeks / 100);
}
