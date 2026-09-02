import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { buildTokenUrl } from "@/lib/url";
import { requireApiUser } from "@/server/auth/api-user";
import { createParentInvite } from "@/server/parents/parent-auth-service";
import { createParentInviteSchema } from "@/server/parents/schemas";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createParentInviteSchema.parse(await request.json().catch(() => ({})));
    const invite = await createParentInvite(currentUser.user, input);
    return NextResponse.json({
      invite: {
        ...invite,
        activationUrl: buildTokenUrl(request, "/parent/activate", invite.token)
      }
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
