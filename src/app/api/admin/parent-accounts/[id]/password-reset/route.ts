import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { buildTokenUrl } from "@/lib/url";
import { requireApiUser } from "@/server/auth/api-user";
import { createParentPasswordReset } from "@/server/parents/parent-auth-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const reset = await createParentPasswordReset(currentUser.user, id);
    return NextResponse.json({
      reset: {
        ...reset,
        resetUrl: buildTokenUrl(request, "/parent/reset-password", reset.token)
      }
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
