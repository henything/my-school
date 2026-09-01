import { redirect } from "next/navigation";
import { CalendarDays, ListChecks, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/app/login/login-form";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(user.role === "COACH" ? "/coach" : user.role === "PARENT" ? "/parent" : "/admin");
  }

  return (
    <main className="brand-shell flex min-h-screen items-center justify-center px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-2xl shadow-[rgba(23,34,31,0.12)] lg:grid-cols-[minmax(0,1.15fr)_420px]">
        <div className="brand-hero min-h-[560px] rounded-none px-7 py-8 sm:px-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[var(--accent)]">
                <ShieldCheck aria-hidden="true" size={21} />
              </span>
              <div>
                <div className="text-lg font-extrabold">Азбука движения</div>
                <div className="text-sm font-semibold text-white/75">My School</div>
              </div>
            </div>
            <span className="brand-pill">Вход в систему</span>
          </div>

          <div className="mt-16 max-w-xl">
            <p className="text-sm font-extrabold uppercase text-white/75">Операционная панель</p>
            <h1 className="mt-3 max-w-lg text-4xl font-extrabold leading-[1.03] sm:text-5xl">Сегодня нужно закрыть главное</h1>
            <p className="mt-4 max-w-md text-base font-medium leading-7 text-white/80">
              Расписание, табели, оплаты и допуск детей в одном рабочем пространстве.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl gap-3 sm:grid-cols-3">
            <div className="metric-card p-4" data-tone="success">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
                <ShieldCheck aria-hidden="true" size={16} />
                Допуск
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[var(--foreground)]">OK</div>
            </div>
            <div className="metric-card p-4" data-tone="warning">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
                <CalendarDays aria-hidden="true" size={16} />
                Занятия
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[var(--foreground)]">24</div>
            </div>
            <div className="metric-card p-4" data-tone="danger">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
                <ListChecks aria-hidden="true" size={16} />
                Задачи
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[var(--foreground)]">6</div>
            </div>
          </div>
        </div>

        <div className="grid content-center gap-7 p-6 sm:p-8">
          <div>
            <p className="text-sm font-extrabold uppercase text-[var(--accent-strong)]">Добро пожаловать</p>
            <h2 className="mt-2 text-2xl font-extrabold">Вход в My School</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Для администраторов, тренеров и родителей.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
