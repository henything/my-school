import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { createSession, setSessionCookie } from "@/server/auth/session-service";
import { activateParentInvite } from "@/server/parents/parent-auth-service";
import { activateParentInviteSchema } from "@/server/parents/schemas";

export async function POST(request: Request) {
  try {
    const input = activateParentInviteSchema.parse(await request.json().catch(() => ({})));
    const user = await activateParentInvite(input);
    const { token, expiresAt } = await createSession(user);
    const response = NextResponse.json({
      user: {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        role: user.role
      },
      redirectTo: "/parent"
    });

    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
