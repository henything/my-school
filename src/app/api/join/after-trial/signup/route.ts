import { NextResponse } from "next/server";
import { signupAfterTrial } from "@/server/trials/enrollment-invite";
import { createSession, setSessionCookie } from "@/server/auth/session-service";
import { errorMessage, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const input = await request.json();
    if (typeof input?.invite !== "string") return jsonError("Нужна персональная ссылка.", 400);
    const user = await signupAfterTrial(input.invite, input);
    const { token, expiresAt } = await createSession(user);
    const response = NextResponse.json({ phone: user.login });
    setSessionCookie(response, token, expiresAt);
    return response;
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
