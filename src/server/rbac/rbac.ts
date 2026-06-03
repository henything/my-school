import type { UserRole } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth/current-user";

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];

export function hasRole(user: Pick<CurrentUser, "role">, roles: UserRole[]) {
  return roles.includes(user.role);
}

export function canCreateUser(user: Pick<CurrentUser, "role">) {
  return user.role === "SUPER_ADMIN";
}

export function canSeeAdminShell(user: Pick<CurrentUser, "role">) {
  return hasRole(user, ADMIN_ROLES);
}

export function canSeeCoachShell(user: Pick<CurrentUser, "role">) {
  return user.role === "COACH";
}

export function assertRole(user: Pick<CurrentUser, "role">, roles: UserRole[]) {
  if (!hasRole(user, roles)) {
    throw new Error("You do not have access to this action.");
  }
}
