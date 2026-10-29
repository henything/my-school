import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";

const db = vi.hoisted(() => ({
  school: { findUniqueOrThrow: vi.fn() },
  trainingGroup: { findMany: vi.fn() },
  lesson: { findMany: vi.fn() },
  child: { groupBy: vi.fn() },
  trialTestJourney: { findMany: vi.fn() },
  trialParticipant: { groupBy: vi.fn() },
  $transaction: vi.fn(),
  requestedLesson: vi.fn()
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => db }));
vi.mock("./fdoc-client", () => ({ assertFdocConfigured: vi.fn(), sendFdocPackage: vi.fn(), fdocStatus: vi.fn(), fdocSignedPdf: vi.fn() }));
import { productionBookingGroups, registerProductionJourney } from "./fdoc-full-cycle-test";

const schoolId = "00000000-0000-4000-8000-000000000001";
const user: CurrentUser = { id: "parent", schoolId, role: "PARENT", login: "parent", displayName: "Родитель" };
const input = { lessonId: "00000000-0000-4000-8000-000000000002", parentName: "Родитель Пример", childName: "Ребёнок Пример", childBirthDate: "2021-01-01" };

beforeEach(() => {
  vi.stubEnv("FDOC_PUBLIC_BOOKING_ENABLED", "true");
  vi.stubEnv("FDOC_PROD_ENABLED", "true");
  vi.stubEnv("FDOC_ENVIRONMENT", "PRODUCTION");
  vi.stubEnv("APP_BASE_URL", "https://azbukadvizheniya.ru");
  vi.stubEnv("FDOC_BOOKING_ALL_GROUPS", "true");
  vi.stubEnv("FDOC_PRODUCTION_SCHOOL_ID", schoolId);
  db.school.findUniqueOrThrow.mockResolvedValue({ id: schoolId });
  db.trainingGroup.findMany.mockResolvedValue(["Группа первая", "Группа вторая"].map((name, index) => ({
    id: `group-${index}`, name, address: null, branch: { name: `Сад ${index}`, address: "Адрес сада" }, scheduleTemplates: []
  })));
  db.lesson.findMany.mockResolvedValue([]);
  db.child.groupBy.mockResolvedValue([]);
  db.trialTestJourney.findMany.mockResolvedValue([]);
  db.trialParticipant.groupBy.mockResolvedValue([]);
  db.$transaction.mockImplementation((callback) => callback({ lesson: { findFirstOrThrow: db.requestedLesson } }));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("lists all active groups of the configured school without a pilot group filter", async () => {
  const groups = await productionBookingGroups();
  expect(groups.map((group) => group.name)).toEqual(["Группа первая", "Группа вторая"]);
  expect(db.trainingGroup.findMany.mock.calls[0][0].where).toEqual({
    schoolId, status: "ACTIVE", branch: { status: "ACTIVE" },
    mainCoach: { user: { status: "ACTIVE" } }, name: { not: "Группа F.Doc ТЕСТ" }
  });
  expect(db.school.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: schoolId }, select: { id: true } });
});

it("rejects a parent from another school before any registration transaction", async () => {
  await expect(registerProductionJourney(input, { ...user, schoolId: "another-school" })).rejects.toThrow("только родителю");
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("constrains the selected lesson to the same school and active staffed groups", async () => {
  db.requestedLesson.mockRejectedValue(new Error("Недоступное занятие"));
  await expect(registerProductionJourney(input, user)).rejects.toThrow("Недоступное занятие");
  expect(db.requestedLesson.mock.calls[0][0].where).toEqual({
    id: input.lessonId, schoolId, status: { not: "CANCELLED" },
    group: { status: "ACTIVE", branch: { status: "ACTIVE" }, mainCoach: { user: { status: "ACTIVE" } }, name: { not: "Группа F.Doc ТЕСТ" } }
  });
});

it("fails closed when all-group booking has no configured school", async () => {
  vi.stubEnv("FDOC_PRODUCTION_SCHOOL_ID", "");
  await expect(productionBookingGroups()).rejects.toThrow();
  expect(db.trainingGroup.findMany).not.toHaveBeenCalled();
});
