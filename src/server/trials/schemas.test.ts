import { describe, expect, it } from "vitest";
import { convertTrialSchema, createTrialSchema, updateTrialStatusSchema } from "./schemas";

const lessonId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";

describe("trial schemas", () => {
  it("allows creating a trial with optional fields omitted", () => {
    const input = createTrialSchema.parse({ lessonId });

    expect(input.lessonId).toBe(lessonId);
    expect(input.source).toBe("UNKNOWN");
    expect(input.childName).toBeUndefined();
    expect(input.childAge).toBeUndefined();
  });

  it("normalizes empty optional fields", () => {
    const input = createTrialSchema.parse({
      lessonId,
      childName: " ",
      childAge: "",
      parentPhone: "+79991234567",
      source: "VK"
    });

    expect(input.childName).toBeNull();
    expect(input.childAge).toBeNull();
    expect(input.parentPhone).toBe("+79991234567");
    expect(input.source).toBe("VK");
  });

  it("rejects invalid age values", () => {
    expect(createTrialSchema.safeParse({ lessonId, childAge: "19" }).success).toBe(false);
    expect(createTrialSchema.safeParse({ lessonId, childAge: "-1" }).success).toBe(false);
  });

  it("rejects invalid phone length", () => {
    expect(createTrialSchema.safeParse({ lessonId, parentPhone: "+7" }).success).toBe(false);
    expect(createTrialSchema.safeParse({ lessonId, parentPhone: "89991234567" }).success).toBe(false);
    expect(createTrialSchema.safeParse({ lessonId, parentPhone: "+7 999 123-45-67" }).success).toBe(false);
    expect(createTrialSchema.safeParse({ lessonId, parentPhone: "+799912345678" }).success).toBe(false);
  });

  it("parses coach/admin status updates", () => {
    const input = updateTrialStatusSchema.parse({ status: "TRIAL_ATTENDED", comment: " пришёл " });

    expect(input.status).toBe("TRIAL_ATTENDED");
    expect(input.comment).toBe("пришёл");
    expect(input.source).toBeUndefined();
  });

  it("parses conversion overrides", () => {
    const input = convertTrialSchema.parse({
      childFullName: " Новый ребёнок ",
      currentGroupId: groupId,
      parentName: "",
      adminComment: "ок"
    });

    expect(input.childFullName).toBe("Новый ребёнок");
    expect(input.currentGroupId).toBe(groupId);
    expect(input.parentName).toBeNull();
    expect(input.adminComment).toBe("ок");
  });
});
