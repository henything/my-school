import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";

const mocks = vi.hoisted(() => ({
  findTrial: vi.fn(), findJourney: vi.fn(), upsert: vi.fn(), claim: vi.fn(), update: vi.fn(), send: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({
  trialParticipant: { findFirstOrThrow: mocks.findTrial },
  trialTestJourney: { findUnique: mocks.findJourney },
  trialSigningPackage: { upsert: mocks.upsert, updateMany: mocks.claim, update: mocks.update }
}) }));
vi.mock("./fdoc-client", () => ({ assertFdocConfigured: vi.fn(), sendFdocPackage: mocks.send }));
vi.mock("./fdoc-full-cycle-test", () => ({ finalizeSignedTestJourneyByTrialId: vi.fn() }));
vi.mock("@/server/audit/audit-service", () => ({ writeAuditLog: vi.fn() }));
import { startTrialSigning } from "./trial-signing-service";

const user: CurrentUser = { id: "admin", schoolId: "school", role: "ADMIN", login: "admin", displayName: "Администратор" };
const journey = { mode: "PRODUCTION", scheduleChosenAt: new Date("2026-10-29"), attendanceWeekday: 4, reserveExpiresAt: new Date("2050-01-01"), childBirthDate: new Date("2021-05-19") };

beforeEach(() => {
  vi.stubEnv("FDOC_ENVIRONMENT", "PRODUCTION");
  vi.stubEnv("FDOC_CONTRACT_DYNAMIC_TERMS", "true");
  vi.stubEnv("FDOC_CONTRACT_WEEKLY_SCHEDULE_PARAM_ID", "16");
  vi.stubEnv("FDOC_CONTRACT_LESSON_PRICE_PARAM_ID", "17");
  mocks.findTrial.mockResolvedValue({
    childName: "Ребёнок Пример", parentName: "Родитель Пример", parentPhone: "89990000000",
    status: "WANTS_TO_CONTINUE", trialAttended: true, coach: { userId: "coach" },
    group: { name: "81 сад (корпус 2)", scheduleTemplates: [{ weekday: 2 }, { weekday: 4 }] }
  });
  mocks.findJourney.mockResolvedValue(journey);
  mocks.upsert.mockResolvedValue({ id: "package", method: "FDOC", status: "PENDING" });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue({ contractDocumentId: "contract", consentDocumentId: "consent" });
  mocks.update.mockResolvedValue({ id: "package", status: "WAITING" });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("uses the parent's chosen weekday and the billing lesson price in the contract", async () => {
  await startTrialSigning(user, "trial");
  expect(mocks.send).toHaveBeenCalledWith("package", expect.objectContaining({
    parentPhone: "+79990000000", childBirth: "19.05.2021", groupName: "81 сад (корпус 2)",
    weeklySchedule: "1 занятие в неделю, по четвергам", lessonPriceRub: "450"
  }));
});

it("uses both group days when the parent selected the full schedule", async () => {
  mocks.findJourney.mockResolvedValue({ ...journey, attendanceWeekday: null });
  await startTrialSigning(user, "trial");
  expect(mocks.send).toHaveBeenCalledWith("package", expect.objectContaining({
    weeklySchedule: "2 занятия в неделю, по вторникам и четвергам"
  }));
});

it("rejects a removed weekday before claiming a package or sending any document", async () => {
  mocks.findJourney.mockResolvedValue({ ...journey, attendanceWeekday: 3 });
  await expect(startTrialSigning(user, "trial")).rejects.toThrow("больше нет в расписании");
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("requires a chosen journey schedule for the revised contract", async () => {
  mocks.findJourney.mockResolvedValue({ ...journey, scheduleChosenAt: null });
  await expect(startTrialSigning(user, "trial")).rejects.toThrow("выбрать график");
  mocks.findJourney.mockResolvedValue(null);
  const trial = await mocks.findTrial();
  mocks.findTrial.mockResolvedValue({ ...trial, status: "TRIAL_ATTENDED" });
  await expect(startTrialSigning(user, "trial")).rejects.toThrow("выбрать график");
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
