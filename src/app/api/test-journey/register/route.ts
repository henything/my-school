import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { registerTestJourney } from "@/server/trials/fdoc-full-cycle-test";
import { createSession, setSessionCookie } from "@/server/auth/session-service";
import { getCurrentUser } from "@/server/auth/current-user";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    const parentUser = currentUser?.role === "PARENT" ? currentUser : null;
    const result = await registerTestJourney(await request.json(), parentUser);
    const response = NextResponse.json({ token: result.token });
    if (!parentUser) {
      const { token, expiresAt } = await createSession(result.user);
      setSessionCookie(response, token, expiresAt);
    }
    return response;
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
