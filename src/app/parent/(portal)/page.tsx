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

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Азбука движения</p>
        <h1 className="mt-2 text-2xl font-bold">Дети</h1>
      </section>

      <section className="grid gap-4">
        {dashboard.children.map((child) => {
          const nextLesson = child.upcomingLessons[0] ?? null;
          const firstInvoice = child.openInvoices[0] ?? null;

          return (
            <Link key={child.id} href={`/parent/children/${child.id}`} className="panel block p-5 hover:border-[var(--accent)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{child.fullName}</h2>
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
    <div className="rounded-lg border border-[var(--line)] bg-[#fbfcfa] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-bold">{value}</div>
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
