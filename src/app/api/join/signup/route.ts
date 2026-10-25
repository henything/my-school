import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { signupProductionParent } from "@/server/trials/fdoc-full-cycle-test";
import { createSession, setSessionCookie } from "@/server/auth/session-service";

export async function POST(request: Request) {
  try {
    const user = await signupProductionParent(await request.json());
    const { token, expiresAt } = await createSession(user);
    const response = NextResponse.json({ phone: user.login });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
