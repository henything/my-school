import type { Prisma } from "@/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveFirstPaidLessonDate } from "./enrollment-dates";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const txWithLesson = (found: boolean) => ({
  lesson: { findFirst: vi.fn().mockResolvedValue(found ? { id: "lesson-1" } : null) }
}) as unknown as Prisma.TransactionClient;

describe("first paid lesson after a trial", () => {
  it("accepts a real later lesson in the selected group", async () => {
    const tx = txWithLesson(true);
    await expect(resolveFirstPaidLessonDate(tx, "school-1", "group-1", date("2026-10-08"), date("2026-10-06")))
      .resolves.toEqual(date("2026-10-08"));
  });

  it("rejects treating the trial itself or a missing group lesson as paid", async () => {
    const tx = txWithLesson(false);
    await expect(resolveFirstPaidLessonDate(tx, "school-1", "group-1", date("2026-10-06"), date("2026-10-06")))
      .rejects.toThrow("позже пробного");
    await expect(resolveFirstPaidLessonDate(tx, "school-1", "group-1", date("2026-10-08"), date("2026-10-06")))
      .rejects.toThrow("нет занятия");
  });
});
