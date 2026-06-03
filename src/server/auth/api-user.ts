import type { UserRole } from "@/generated/prisma/enums";
import { getCurrentUser, type CurrentUser } from "@/server/auth/current-user";
import { hasRole } from "@/server/rbac/rbac";

type ApiUserResult =
  | {
      ok: true;
      user: CurrentUser;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function requireApiUser(roles?: UserRole[]): Promise<ApiUserResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Требуется вход."
    };
  }

  if (roles && !hasRole(user, roles)) {
    return {
      ok: false,
      status: 403,
      error: "Недостаточно прав."
    };
  }

  return {
    ok: true,
    user
  };
}
