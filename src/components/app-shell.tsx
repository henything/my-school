import Link from "next/link";
import { CalendarDays, LayoutDashboard, MapPinned, ShieldCheck, Users, WalletCards } from "lucide-react";
import type { CurrentUser } from "@/server/auth/current-user";
import { LogoutButton } from "@/components/logout-button";

type AppShellProps = {
  user: CurrentUser;
  area: "admin" | "coach";
  children: React.ReactNode;
};

export function AppShell({ user, area, children }: AppShellProps) {
  const isAdmin = area === "admin";

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href={isAdmin ? "/admin" : "/coach"} className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              {isAdmin ? <ShieldCheck aria-hidden="true" size={20} /> : <LayoutDashboard aria-hidden="true" size={20} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold">My School</span>
              <span className="block truncate text-sm text-[var(--muted)]">
                {isAdmin ? "Администрирование" : "Кабинет тренера"}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{user.displayName}</div>
              <div className="text-xs text-[var(--muted)]">{user.role}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {isAdmin ? (
        <nav className="border-b border-[var(--line)] bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 py-2 sm:px-6">
            <Link
              href="/admin"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
            >
              <Users aria-hidden="true" size={16} />
              Пользователи
            </Link>
            <Link
              href="/admin/directories"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
            >
              <MapPinned aria-hidden="true" size={16} />
              Справочники
            </Link>
            <Link
              href="/admin/schedule"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
            >
              <CalendarDays aria-hidden="true" size={16} />
              Расписание
            </Link>
            <Link
              href="/admin/billing"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
            >
              <WalletCards aria-hidden="true" size={16} />
              Балансы
            </Link>
          </div>
        </nav>
      ) : null}

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </main>
  );
}
