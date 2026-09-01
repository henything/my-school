import Link from "next/link";
import { CalendarDays, CreditCard, RefreshCcw } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { getParentDashboard } from "@/server/parents/parent-portal-service";

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

export default async function ParentHomePage() {
  const currentUser = await requireRole(["PARENT"]);
  const dashboard = await getParentDashboard(currentUser);
  const totalLessons = dashboard.children.reduce((sum, child) => sum + child.lessonBalance, 0);
  const totalMakeups = dashboard.children.reduce((sum, child) => sum + child.makeupBalance, 0);
  const totalOpenInvoices = dashboard.children.reduce((sum, child) => sum + child.openInvoices.length, 0);

  return (
    <div className="grid gap-6">
      <section className="brand-hero px-5 pb-20 pt-6 sm:px-7">
        <p className="text-sm font-extrabold uppercase text-white/75">Кабинет родителя</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.03] sm:text-5xl">Дети, занятия и оплаты</h1>
        <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/80">Ближайшее занятие, остаток и счета видны сразу.</p>
      </section>

      <section className="relative z-10 -mt-14 grid gap-3 sm:grid-cols-3">
        <div className="metric-card grid gap-2 p-4" data-tone="info">
          <span className="text-sm font-bold text-[var(--muted)]">Детей</span>
          <span className="text-3xl font-extrabold">{dashboard.children.length}</span>
        </div>
        <div className="metric-card grid gap-2 p-4" data-tone="success">
          <span className="text-sm font-bold text-[var(--muted)]">Остаток</span>
          <span className="text-3xl font-extrabold">{totalLessons}</span>
          <span className="text-xs font-semibold text-[var(--muted)]">занятий · {totalMakeups} переносов</span>
        </div>
        <div className="metric-card grid gap-2 p-4" data-tone={totalOpenInvoices > 0 ? "warning" : "success"}>
          <span className="text-sm font-bold text-[var(--muted)]">Счета</span>
          <span className="text-3xl font-extrabold">{totalOpenInvoices}</span>
        </div>
      </section>

      <section className="grid gap-4">
        {dashboard.children.map((child) => {
          const nextLesson = child.upcomingLessons[0] ?? null;
          const firstInvoice = child.openInvoices[0] ?? null;

          return (
            <Link key={child.id} href={`/parent/children/${child.id}`} className="panel block p-5 transition hover:border-[var(--accent)] hover:bg-[var(--blue-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold">{child.fullName}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{child.currentGroup?.name ?? "Без группы"}</p>
                </div>
                <StatusBadge status={parentAdmissionLabel(child.admissionStatus)} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <InfoTile
                  icon={<CalendarDays aria-hidden="true" size={18} />}
                  label="Следующее занятие"
                  value={nextLesson ? `${formatDate(nextLesson.lessonDate)} ${nextLesson.startTime}` : "Нет в расписании"}
                />
                <InfoTile
                  icon={<RefreshCcw aria-hidden="true" size={18} />}
                  label="Остаток"
                  value={`${child.lessonBalance} занятий · ${child.makeupBalance} переносов`}
                />
                <InfoTile
                  icon={<CreditCard aria-hidden="true" size={18} />}
                  label="К оплате"
                  value={firstInvoice ? formatKopeks(firstInvoice.remainingAmountKopeks) : "Нет открытых счетов"}
                />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-extrabold">{value}</div>
    </div>
  );
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
