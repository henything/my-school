import { CalendarDays, ClipboardCheck } from "lucide-react";

export default function CoachPage() {
  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-00</p>
        <h1 className="mt-2 text-2xl font-bold">Кабинет тренера</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Базовая мобильная оболочка тренера готова для следующих блоков с расписанием и посещаемостью.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-5">
          <CalendarDays className="mb-4 text-[var(--accent)]" aria-hidden="true" size={24} />
          <h2 className="text-lg font-bold">Расписание</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Будет подключено в блоках занятий и attendance.</p>
        </div>
        <div className="panel p-5">
          <ClipboardCheck className="mb-4 text-[var(--accent)]" aria-hidden="true" size={24} />
          <h2 className="text-lg font-bold">Посещаемость</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Backend guard уже отделяет тренера от admin-интерфейса.</p>
        </div>
      </section>
    </div>
  );
}
