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
        "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition",
        isActive
          ? "bg-[#e5f2ef] text-[var(--accent-strong)] ring-1 ring-inset ring-[#c7ded7]"
          : "text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
      )
    };
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              {isAdmin ? (
                <ShieldCheck aria-hidden="true" size={20} />
              ) : isParent ? (
                <Baby aria-hidden="true" size={20} />
              ) : (
                <LayoutDashboard aria-hidden="true" size={20} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-bold">Азбука движения</span>
              <span className="block truncate text-sm text-[var(--muted)]">{areaLabel}</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{user.displayName}</div>
              <div className="text-xs text-[var(--muted)]">{labelForEnum(user.role)}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {isParent ? (
        <nav className="border-b border-[var(--line)] bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 py-2 sm:px-6">
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
        <nav className="border-b border-[var(--line)] bg-white">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 py-2 sm:px-6">
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
            <Link href="/admin/readiness" {...navLinkProps("/admin/readiness")}>
              <Rocket aria-hidden="true" size={16} />
              Readiness
            </Link>
            <Link href="/admin/stabilization" {...navLinkProps("/admin/stabilization")}>
              <ShieldAlert aria-hidden="true" size={16} />
              Стабилизация
            </Link>
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
