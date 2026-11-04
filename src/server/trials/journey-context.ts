import { z } from "zod";
import { getPrisma } from "@/server/db/prisma";
import { assertFdocConfigured } from "./fdoc-client";
export type JourneyMode = "TEST" | "PRODUCTION";

export const activeBookingGroup = {
  status: "ACTIVE",
  branch: { status: "ACTIVE" },
  mainCoach: { user: { status: "ACTIVE" } },
  name: { not: "Группа F.Doc ТЕСТ" }
} as const;

export async function contextFor(mode: JourneyMode) {
  if (mode === "TEST") return { ...assertTestMode(), groupId: null };
  if (process.env.FDOC_PROD_ENABLED !== "true" || process.env.APP_BASE_URL !== "https://azbukadvizheniya.ru" ||
      process.env.FDOC_ENVIRONMENT !== "PRODUCTION") {
    throw new Error("Запись на пробное сейчас закрыта.");
  }
  if (process.env.FDOC_BOOKING_ALL_GROUPS === "true") {
    const schoolId = z.uuid().parse(process.env.FDOC_PRODUCTION_SCHOOL_ID);
    const school = await getPrisma().school.findUniqueOrThrow({ where: { id: schoolId }, select: { id: true } });
    return { schoolId: school.id, groupId: null, accessCode: null };
  }
  if (!process.env.FDOC_PILOT_GROUP_ID) throw new Error("Запись на пробное сейчас закрыта.");
  const group = await getPrisma().trainingGroup.findFirstOrThrow({
    where: { id: process.env.FDOC_PILOT_GROUP_ID, ...activeBookingGroup },
    select: { id: true, schoolId: true }
  });
  return { schoolId: group.schoolId, groupId: group.id, accessCode: null };
}

export function assertBookingOpen(mode: JourneyMode) {
  if (mode === "PRODUCTION" && process.env.FDOC_PUBLIC_BOOKING_ENABLED !== "true") {
    throw new Error("Запись на пробное сейчас закрыта.");
  }
  if (mode === "PRODUCTION") assertFdocConfigured();
}

export function assertTestMode() {
  if (
    process.env.FDOC_FULL_CYCLE_TEST_ENABLED !== "true" ||
    (process.env.FDOC_BASE_URL ?? "https://demo.fdoc.ru") !== "https://demo.fdoc.ru" ||
    process.env.APP_BASE_URL !== "https://test.195.133.56.68.sslip.io" ||
    !process.env.FDOC_TEST_SCHOOL_ID ||
    !process.env.FDOC_TEST_SIGNUP_CODE
  ) throw new Error("Полный тестовый сценарий не настроен.");
  return { schoolId: process.env.FDOC_TEST_SCHOOL_ID, accessCode: process.env.FDOC_TEST_SIGNUP_CODE };
}

