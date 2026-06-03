import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken, SESSION_DURATION_DAYS, sessionExpiresAt } from "./session-token";

describe("session tokens", () => {
  it("creates opaque random tokens and stores only hashes", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(hashSessionToken(first)).toHaveLength(64);
    expect(hashSessionToken(first)).not.toEqual(first);
  });

  it("uses a fourteen day session window", () => {
    const now = new Date("2026-06-03T10:00:00.000Z");
    const expiresAt = sessionExpiresAt(now);

    expect(expiresAt.toISOString()).toBe("2026-06-17T10:00:00.000Z");
    expect(SESSION_DURATION_DAYS).toBe(14);
  });
});
