import { NextResponse } from "next/server";
import { loginSchema } from "@/server/auth/schemas";
import { authenticateWithPassword } from "@/server/auth/auth-service";
import { createSession, setSessionCookie } from "@/server/auth/session-service";
import { writeAuditLog } from "@/server/audit/audit-service";
import { errorMessage, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json().catch(() => ({})));
    const user = await authenticateWithPassword(input.login, input.password);

    if (!user) {
      return jsonError("Неверный логин или пароль.", 401);
    }

    const { token, expiresAt } = await createSession(user);
    const redirectTo = user.role === "COACH" ? "/coach" : "/admin";
    const response = NextResponse.json({
      user: {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        role: user.role
      },
      redirectTo
    });

    setSessionCookie(response, token, expiresAt);

    await writeAuditLog({
      schoolId: user.schoolId,
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      entityType: "Session"
    });

    return response;
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
