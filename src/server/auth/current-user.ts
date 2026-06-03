import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/enums";
import { getPrisma } from "@/server/db/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "./session-token";

export type CurrentUser = {
  id: string;
  schoolId: string;
  login: string;
  displayName: string;
  role: UserRole;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const prisma = getPrisma();

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return {
    id: session.user.id,
    schoolId: session.user.schoolId,
    login: session.user.login,
    displayName: session.user.displayName,
    role: session.user.role
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/access-denied");
  }
  return user;
}
