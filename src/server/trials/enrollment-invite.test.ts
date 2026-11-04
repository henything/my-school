import { beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
const db = vi.hoisted(() => ({
  trial: { findFirstOrThrow: vi.fn() }, invite: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  parentAccount: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() }, group: { findFirstOrThrow: vi.fn() }, child: { count: vi.fn(), create: vi.fn() },
  journey: { count: vi.fn(), create: vi.fn() }, transaction: vi.fn(), raw: vi.fn(), audit: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ trialEnrollmentInvite: db.invite, parentAccount: db.parentAccount, $transaction: db.transaction }) }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: db.audit }));
vi.mock("./fdoc-full-cycle-test", () => ({ registrationSchema: z.object({ lessonId: z.string(), parentName: z.string(), childName: z.string(), childBirthDate: z.string() }), signupParent: vi.fn() }));
vi.mock("./journey-context", () => ({ activeBookingGroup: { status: "ACTIVE" }, assertBookingOpen: vi.fn(), contextFor: async () => ({ schoolId: "school", groupId: null }) }));
import { z } from "zod";
import { claimEnrollmentInvite, issueEnrollmentInvite, previewEnrollmentInvite } from "./enrollment-invite";
import { enrollmentInviteToken } from "./enrollment-invite-rules";
const id = "00000000-0000-4000-8000-000000000001";
const token = enrollmentInviteToken(id);
const coach: CurrentUser = { id: "coach", schoolId: "school", role: "COACH", login: "coach", displayName: "Тренер" };
const parent: CurrentUser = { ...coach, id: "parent-user", role: "PARENT" };
const trial = { id: "trial", groupId: "group", status: "WANTS_TO_CONTINUE", trialAttended: true, convertedChildId: null, testJourney: null, signingPackage: null, childName: "Ребёнок", lesson: { lessonDate: new Date("2026-01-01"), startTime: "16:00", status: "PLANNED", coach: { userId: "coach" }, substituteCoach: null }, group: { name: "Группа", status: "ACTIVE", branch: { name: "Сад", status: "ACTIVE" } } };
const unclaimed = { id, trialId: "trial", expiresAt: new Date("2050-01-01"), claimedAt: null, claimedParentId: null, trial };
const tx = { trialParticipant: db.trial, trialEnrollmentInvite: db.invite, parentAccount: db.parentAccount, trainingGroup: db.group, child: db.child, trialTestJourney: db.journey, $queryRaw: db.raw };
beforeEach(() => {
  vi.clearAllMocks();
  db.transaction.mockImplementation(fn => fn(tx));
  db.trial.findFirstOrThrow.mockResolvedValue(trial);
  db.invite.findFirst.mockResolvedValue(unclaimed); db.invite.findUnique.mockResolvedValue(unclaimed);
  db.invite.findUniqueOrThrow.mockResolvedValue(unclaimed);
  db.parentAccount.findFirstOrThrow.mockResolvedValue({ parentId: "parent", parent: { id: "parent" } });
});
it("allows coach and admin to copy the same invitation without extending its expiry", async () => {
  const first = await issueEnrollmentInvite(coach, "trial");
  expect(await issueEnrollmentInvite({ ...coach, role: "ADMIN" }, "trial")).toEqual(first);
  expect(first.path).toContain(token);
  expect(db.invite.upsert).not.toHaveBeenCalled();
});
it("denies unrelated coaches, another school and parents before writing anything", async () => {
  for (const user of [{ ...coach, id: "stranger" }, { ...coach, schoolId: "another-school" }, parent]) await expect(issueEnrollmentInvite(user, "trial")).rejects.toThrow();
  expect(db.invite.upsert).not.toHaveBeenCalled();
});
it("rejects missing attendance or an existing journey on issue", async () => {
  db.trial.findFirstOrThrow.mockResolvedValue({ ...trial, trialAttended: false });
  await expect(issueEnrollmentInvite(coach, "trial")).rejects.toThrow("присутствие");
  db.trial.findFirstOrThrow.mockResolvedValue({ ...trial, testJourney: {} });
  await expect(issueEnrollmentInvite(coach, "trial")).rejects.toThrow("оформление");
});
it("does not expose family data on a used invitation to an anonymous visitor", async () => {
  db.invite.findFirst.mockResolvedValue({ ...unclaimed, claimedAt: new Date(), claimedParentId: "parent" });
  expect(await previewEnrollmentInvite(token, null)).toEqual({ mode: "TEST", claimed: true });
  expect(db.parentAccount.findFirst).not.toHaveBeenCalled();
});
it("rejects an expired invitation before signup or data changes", async () => {
  db.invite.findFirst.mockResolvedValue({ ...unclaimed, expiresAt: new Date("2020-01-01") });
  await expect(previewEnrollmentInvite(token, null)).rejects.toThrow("истёк");
  expect(db.child.create).not.toHaveBeenCalled();
});
it("rejects another parent racing to claim the link after an initial valid read", async () => {
  db.invite.findUniqueOrThrow.mockResolvedValue({ ...unclaimed, claimedAt: new Date(), claimedParentId: "somebody-else", trial: { ...trial, testJourney: { id: "journey" } } });
  await expect(claimEnrollmentInvite(token, { parentName: "Родитель", childName: "Ребёнок", childBirthDate: "2021-01-01" }, parent)).rejects.toThrow("другим родителем");
  expect(db.child.create).not.toHaveBeenCalled();
});
it("returns the same journey on a repeated submit by its owner", async () => {
  db.invite.findUniqueOrThrow.mockResolvedValue({ ...unclaimed, claimedAt: new Date(), claimedParentId: "parent", trial: { ...trial, testJourney: { id: "journey" } } });
  expect(await claimEnrollmentInvite(token, { parentName: "Родитель", childName: "Ребёнок", childBirthDate: "2021-01-01" }, parent)).toEqual({ token: "journey", mode: "TEST" });
  expect(db.child.create).not.toHaveBeenCalled(); expect(db.journey.create).not.toHaveBeenCalled();
});
it("renews an expired invitation only if a seat remains after other reservations", async () => {
  db.invite.findUnique.mockResolvedValue({ ...unclaimed, expiresAt: new Date("2020-01-01") });
  db.group.findFirstOrThrow.mockResolvedValue({ capacityLimit: 2 });
  db.child.count.mockResolvedValue(1); db.journey.count.mockResolvedValue(0); db.invite.count.mockResolvedValue(1);
  await expect(issueEnrollmentInvite(coach, "trial")).rejects.toThrow("свободного места");
  expect(db.invite.upsert).not.toHaveBeenCalled();
  db.invite.count.mockResolvedValue(0); db.invite.upsert.mockResolvedValue(unclaimed);
  await issueEnrollmentInvite(coach, "trial");
  expect(db.invite.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { expiresAt: expect.any(Date) } }));
});
it("allows a substitute coach but never exposes another school's invitation", async () => {
  db.trial.findFirstOrThrow.mockResolvedValue({ ...trial, lesson: { ...trial.lesson, coach: { userId: "other" }, substituteCoach: { userId: coach.id } } });
  await expect(issueEnrollmentInvite(coach, "trial")).resolves.toHaveProperty("path");
  await previewEnrollmentInvite(token, null);
  expect(db.invite.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id, trial: { schoolId: "school" } } }));
});
