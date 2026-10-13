import { describe, expect, it } from "vitest";
import { createChildEnrollmentSchema, createChildSchema, updateChildSchema } from "./schemas";

describe("child schemas", () => {
  it("accepts a child with one current group", () => {
    const child = createChildSchema.parse({
      fullName: "Иван Петров",
      currentGroupId: "11111111-1111-4111-8111-111111111111",
      status: "ACTIVE",
      admissionStatus: "ADMITTED"
    });

    expect(child.currentGroupId).toBe("11111111-1111-4111-8111-111111111111");
    expect(child.status).toBe("ACTIVE");
  });

  it("rejects unsupported child statuses", () => {
    expect(() =>
      updateChildSchema.parse({
        status: "DELETED"
      })
    ).toThrow();
  });

  it("accepts enrollment with a new parent", () => {
    const enrollment = createChildEnrollmentSchema.parse({
      fullName: "Анна Петрова",
      parentFullName: "Мария Петрова",
      parentPhone: "+79991112233",
      comment: "Общий комментарий по ребёнку",
      status: "ACTIVE",
      admissionStatus: "ADMITTED"
    });

    expect(enrollment.parentFullName).toBe("Мария Петрова");
    expect(enrollment.parentPhone).toBe("+79991112233");
    expect(enrollment.comment).toBe("Общий комментарий по ребёнку");
    expect(enrollment.parentId).toBeUndefined();
  });

  it("rejects enrollment with existing and new parent data together", () => {
    expect(() =>
      createChildEnrollmentSchema.parse({
        fullName: "Анна Петрова",
        parentId: "11111111-1111-4111-8111-111111111111",
        parentFullName: "Мария Петрова",
        status: "ACTIVE",
        admissionStatus: "ADMITTED"
      })
    ).toThrow();
  });

  it("requires phone when enrollment creates a new parent", () => {
    expect(() =>
      createChildEnrollmentSchema.parse({
        fullName: "Анна Петрова",
        parentFullName: "Мария Петрова",
        status: "ACTIVE",
        admissionStatus: "ADMITTED"
      })
    ).toThrow();
  });

  it("does not clear birth date when patch input omits it", () => {
    const patch = updateChildSchema.parse({
      currentGroupId: "11111111-1111-4111-8111-111111111111"
    });

    expect(patch).not.toHaveProperty("birthDate");
  });

  it("requires a paid start date when linking a past trial", () => {
    expect(() => createChildEnrollmentSchema.parse({
      fullName: "Иван Петров",
      currentGroupId: "11111111-1111-4111-8111-111111111111",
      trialLessonId: "22222222-2222-4222-8222-222222222222"
    })).toThrow();

    const enrollment = createChildEnrollmentSchema.parse({
      fullName: "Иван Петров",
      currentGroupId: "11111111-1111-4111-8111-111111111111",
      trialLessonId: "22222222-2222-4222-8222-222222222222",
      trialAttended: true,
      firstPaidLessonDate: "2026-10-08"
    });
    expect(enrollment.firstPaidLessonDate?.toISOString().slice(0, 10)).toBe("2026-10-08");
  });
});
