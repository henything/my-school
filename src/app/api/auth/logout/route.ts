import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/server/audit/audit-service";
import { getCurrentUser } from "@/server/auth/current-user";
import { clearSession, clearSessionCookie } from "@/server/auth/session-service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-token";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = await getCurrentUser();

  if (user) {
    await writeAuditLog({
      schoolId: user.schoolId,
      actorUserId: user.id,
      action: "AUTH_LOGOUT",
      entityType: "Session"
    });
  }

  await clearSession(token);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
