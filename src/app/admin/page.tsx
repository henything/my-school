import { CreateUserForm } from "@/app/admin/create-user-form";
import { UserStatusForm } from "@/app/admin/user-status-form";
import { RoleBadge, StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listUsers } from "@/server/users/user-service";

export default async function AdminPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const users = await listUsers(currentUser);
  const canManageUsers = currentUser.role === "SUPER_ADMIN";
  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const coachUsers = users.filter((user) => user.role === "COACH").length;

  return (
    <div className="grid gap-6">
      <section className="brand-hero px-5 pb-20 pt-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-white/75">Администрирование</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.03] sm:text-5xl">Пользователи и роли</h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/80">Аккаунты администраторов, тренеров и доступы к рабочей системе.</p>
          </div>
          <span className="brand-pill">Всего: {users.length}</span>
        </div>
      </section>

      <section className="relative z-10 -mt-14 grid gap-3 sm:grid-cols-3">
        <div className="metric-card grid gap-2 p-4" data-tone="info">
          <span className="text-sm font-bold text-[var(--muted)]">Пользователи</span>
          <span className="text-3xl font-extrabold">{users.length}</span>
        </div>
        <div className="metric-card grid gap-2 p-4" data-tone="success">
          <span className="text-sm font-bold text-[var(--muted)]">Активные</span>
          <span className="text-3xl font-extrabold">{activeUsers}</span>
        </div>
        <div className="metric-card grid gap-2 p-4" data-tone="warning">
          <span className="text-sm font-bold text-[var(--muted)]">Тренеры</span>
          <span className="text-3xl font-extrabold">{coachUsers}</span>
        </div>
      </section>

      {canManageUsers ? (
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-extrabold">Создать пользователя</h2>
          <CreateUserForm />
        </section>
      ) : null}

      <section className="panel">
        <div className="border-b border-[var(--line)] bg-[var(--panel-soft)] px-5 py-4">
          <h2 className="text-lg font-extrabold">Список пользователей</h2>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Логин</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Создан</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-semibold">{user.displayName}</td>
                  <td>{user.login}</td>
                  <td>
                    <RoleBadge role={user.role} />
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td>
                    <UserStatusForm userId={user.id} status={user.status} disabled={!canManageUsers || user.id === currentUser.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
