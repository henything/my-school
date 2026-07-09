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
