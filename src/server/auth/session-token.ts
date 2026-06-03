import { createHmac, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "my_school_session";
export const SESSION_DURATION_DAYS = 14;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  return expiresAt;
}

function sessionSecret() {
  const value = process.env.SESSION_SECRET;

  if (!value && process.env.NODE_ENV === "test") {
    return "test-session-secret-at-least-32-characters";
  }

  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }

  return value;
}
