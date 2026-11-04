import { afterEach, expect, it, vi } from "vitest";
import { assertWalkInReady, enrollmentInviteId, enrollmentInviteToken } from "./enrollment-invite-rules";

const id = "00000000-0000-4000-8000-000000000001";
const ready = { status: "WANTS_TO_CONTINUE", trialAttended: true, convertedChildId: null, testJourney: null, signingPackage: null };
afterEach(() => vi.unstubAllEnvs());
it("produces a stable invitation and validates its signature", () => {
  expect(enrollmentInviteToken(id)).toBe(enrollmentInviteToken(id));
  expect(enrollmentInviteId(enrollmentInviteToken(id))).toBe(id);
});
it("separates invitation signatures from session tokens and other invitation ids", async () => {
  const { hashSessionToken } = await import("@/server/auth/session-token");
  expect(() => enrollmentInviteId(`${id}.${hashSessionToken(id)}`)).toThrow("недействительна");
  expect(() => enrollmentInviteId(enrollmentInviteToken(id).replace(/000001\./, "000002."))).toThrow("недействительна");
});
it.each(["", id, `${id}.abc`, `${id}.${"0".repeat(64)}`, `${id}.${"0".repeat(64)}.extra`])("rejects malformed or forged token %s", token => {
  expect(() => enrollmentInviteId(token)).toThrow("недействительна");
});
it("invalidates an invitation after signing-secret rotation", () => {
  const token = enrollmentInviteToken(id); vi.stubEnv("SESSION_SECRET", "different-secret-of-at-least-32-characters");
  expect(() => enrollmentInviteId(token)).toThrow("недействительна");
});
it.each(["TRIAL_BOOKED", "TRIAL_NO_SHOW", "TRIAL_ATTENDED", "CONTACT_COLLECTED", "NOT_PLANNING", "CONVERTED_TO_ACTIVE"])("requires both attendance and a decision; rejects %s", status => {
  expect(() => assertWalkInReady({ ...ready, status })).toThrow();
});
it("requires actual attendance and prevents a second child, journey or signing package", () => {
  expect(() => assertWalkInReady(ready)).not.toThrow();
  for (const patch of [{ trialAttended: false }, { convertedChildId: id }, { testJourney: {} }, { signingPackage: {} }]) expect(() => assertWalkInReady({ ...ready, ...patch })).toThrow();
});
