import { describe, expect, it } from "vitest";
import { closeTaskSchema, createManualTaskSchema, taskChecksSchema } from "./schemas";

const userId = "11111111-1111-4111-8111-111111111111";

describe("task schemas", () => {
  it("parses manual tasks with defaults and nullable optional fields", () => {
    const input = createManualTaskSchema.parse({
      assigneeUserId: userId,
      title: "Позвонить родителю",
      description: " ",
      dueAt: "2026-06-20"
    });

    expect(input.priority).toBe("MEDIUM");
    expect(input.assigneeUserId).toBe(userId);
    expect(input.description).toBeNull();
    expect(input.dueAt?.toISOString()).toBe("2026-06-20T00:00:00.000Z");
  });

  it("rejects manual tasks without a title", () => {
    expect(createManualTaskSchema.safeParse({ title: " " }).success).toBe(false);
  });

  it("normalizes close comments and defaults to closed", () => {
    expect(closeTaskSchema.parse({ comment: "  проверено " })).toEqual({ status: "CLOSED", comment: "проверено" });
    expect(closeTaskSchema.parse({ status: "CANCELLED", comment: "" })).toEqual({ status: "CANCELLED", comment: null });
  });

  it("accepts an optional job clock", () => {
    expect(taskChecksSchema.parse({ now: "2026-06-13T18:00:00.000Z" }).now?.toISOString()).toBe("2026-06-13T18:00:00.000Z");
    expect(taskChecksSchema.parse({})).toEqual({});
  });
});
