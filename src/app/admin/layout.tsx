import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/server/auth/current-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireRole(ADMIN_ROLES);

  return (
    <AppShell user={user} area="admin">
      {children}
    </AppShell>
  );
}
