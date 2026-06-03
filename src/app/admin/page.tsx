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

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-00</p>
        <h1 className="mt-2 text-2xl font-bold">Пользователи и роли</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Базовый admin shell, проверка ролей и создание пользователей для первого блока разработки.
        </p>
      </section>

      {canManageUsers ? (
        <section className="panel p-5">
          <h2 className="mb-4 text-lg font-bold">Создать пользователя</h2>
          <CreateUserForm />
        </section>
      ) : null}

      <section className="panel">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-bold">Список пользователей</h2>
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
