import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/server/auth/current-user";

export default async function ParentPortalLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireRole(["PARENT"]);

  return (
    <AppShell user={user} area="parent">
      {children}
    </AppShell>
  );
}
