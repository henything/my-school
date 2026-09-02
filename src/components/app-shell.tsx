"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  CalendarDays,
  CreditCard,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  RefreshCcw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  UserRoundPlus,
  UserCircle,
  Users,
  WalletCards
} from "lucide-react";
import type { CurrentUser } from "@/server/auth/current-user";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";

type AppShellProps = {
  user: CurrentUser;
  area: "admin" | "coach" | "parent";
  children: React.ReactNode;
};

export function AppShell({ user, area, children }: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = area === "admin";
  const isParent = area === "parent";
  const homeHref = isAdmin ? "/admin" : isParent ? "/parent" : "/coach";
  const areaLabel = isAdmin ? "Администрирование" : isParent ? "Кабинет родителя" : "Кабинет тренера";
  const navLinkProps = (href: string, exact = false) => {
    const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

    return {
      "aria-current": isActive ? ("page" as const) : undefined,
      className: cn(
        "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        isActive
          ? "bg-[var(--brand-yellow)] text-[var(--foreground)] shadow-sm"
          : "bg-white text-[var(--muted)] hover:bg-[var(--blue-soft)] hover:text-[var(--foreground)]"
      )
    };
  };

  return (
    <main className="brand-shell min-h-screen">
      <header className="brand-hero rounded-none">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-20 pt-5 sm:px-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent)] shadow-sm">
              {isAdmin ? (
                <ShieldCheck aria-hidden="true" size={20} />
              ) : isParent ? (
                <Baby aria-hidden="true" size={20} />
              ) : (
                <LayoutDashboard aria-hidden="true" size={20} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold">Азбука движения</span>
              <span className="brand-pill mt-1">{areaLabel}</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-extrabold">{user.displayName}</div>
              <div className="text-xs font-semibold text-white/75">{labelForEnum(user.role)}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {isParent ? (
        <nav className="relative z-10 -mt-10 px-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 rounded-lg border border-[var(--line)] bg-white/95 p-2 shadow-lg shadow-[rgba(23,34,31,0.08)] backdrop-blur">
            <Link href="/parent" {...navLinkProps("/parent", true)}>
              <Baby aria-hidden="true" size={16} />
              Дети
            </Link>
            <Link href="/parent/payments" {...navLinkProps("/parent/payments")}>
              <CreditCard aria-hidden="true" size={16} />
              Оплаты
            </Link>
            <Link href="/parent/profile" {...navLinkProps("/parent/profile")}>
              <UserCircle aria-hidden="true" size={16} />
              Профиль
            </Link>
          </div>
        </nav>
      ) : null}

      {isAdmin ? (
        <nav className="relative z-10 -mt-10 px-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 rounded-lg border border-[var(--line)] bg-white/95 p-2 shadow-lg shadow-[rgba(23,34,31,0.08)] backdrop-blur">
            <Link href="/admin" {...navLinkProps("/admin", true)}>
              <Users aria-hidden="true" size={16} />
              Пользователи
            </Link>
            <Link href="/admin/directories" {...navLinkProps("/admin/directories")}>
              <MapPinned aria-hidden="true" size={16} />
              Справочники
            </Link>
            <Link href="/admin/schedule" {...navLinkProps("/admin/schedule")}>
              <CalendarDays aria-hidden="true" size={16} />
              Расписание
            </Link>
            <Link href="/admin/billing" {...navLinkProps("/admin/billing")}>
              <WalletCards aria-hidden="true" size={16} />
              Балансы
            </Link>
            <Link href="/admin/makeups" {...navLinkProps("/admin/makeups")}>
              <RefreshCcw aria-hidden="true" size={16} />
              Переносы
            </Link>
            <Link href="/admin/operations" {...navLinkProps("/admin/operations")}>
              <ListChecks aria-hidden="true" size={16} />
              Операции
            </Link>
            {user.role === "SUPER_ADMIN" ? (
              <>
                <Link href="/admin/readiness" {...navLinkProps("/admin/readiness")}>
                  <Rocket aria-hidden="true" size={16} />
                  Readiness
                </Link>
                <Link href="/admin/stabilization" {...navLinkProps("/admin/stabilization")}>
                  <ShieldAlert aria-hidden="true" size={16} />
                  Стабилизация
                </Link>
              </>
            ) : null}
            <Link href="/admin/trials" {...navLinkProps("/admin/trials")}>
              <UserRoundPlus aria-hidden="true" size={16} />
              Пробники
            </Link>
            <Link href="/admin/audit" {...navLinkProps("/admin/audit")}>
              <History aria-hidden="true" size={16} />
              Аудит
            </Link>
            {user.role === "SUPER_ADMIN" ? (
              <Link href="/admin/import" {...navLinkProps("/admin/import")}>
                <FileSpreadsheet aria-hidden="true" size={16} />
                Excel import
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 sm:px-6">{children}</div>
    </main>
  );
}
