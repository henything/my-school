import type { NextResponse } from "next/server";
import type { User } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { createSessionToken, hashSessionToken, SESSION_COOKIE_NAME, sessionExpiresAt } from "./session-token";

export async function createSession(user: Pick<User, "id" | "schoolId">) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = sessionExpiresAt();

  await getPrisma().session.create({
    data: {
      userId: user.id,
      schoolId: user.schoolId,
      tokenHash,
      expiresAt
    }
  });

  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession(token: string | undefined) {
  if (!token) {
    return;
  }

  const tokenHash = hashSessionToken(token);
  await getPrisma().session.delete({ where: { tokenHash } }).catch(() => undefined);
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0)
  });
}
