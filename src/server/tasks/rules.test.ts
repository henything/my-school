import { describe, expect, it } from "vitest";
import { containsCoachForbiddenFinancialField } from "@/server/rbac/rbac";
import { buildTaskDedupeWhere, requiresCloseComment, serializeTask } from "./task-service";

describe("task rules", () => {
  it("deduplicates by open task type, entity and assignee", () => {
    expect(
      buildTaskDedupeWhere({
        schoolId: "school-1",
        type: "ATTENDANCE_NOT_FILLED",
        relatedEntityType: "Lesson",
        relatedEntityId: "lesson-1",
        assigneeUserId: "coach-1"
      })
    ).toEqual({
      schoolId: "school-1",
      type: "ATTENDANCE_NOT_FILLED",
      relatedEntityType: "Lesson",
      relatedEntityId: "lesson-1",
      assigneeUserId: "coach-1",
      status: { in: ["OPEN", "IN_PROGRESS"] }
    });
  });

  it("keeps unassigned tasks in a separate dedupe bucket", () => {
    expect(
      buildTaskDedupeWhere({
        schoolId: "school-1",
        type: "GROUP_OVER_CAPACITY",
        relatedEntityType: "Group",
        relatedEntityId: "group-1",
        assigneeUserId: undefined
      }).assigneeUserId
    ).toBeNull();
  });

  it("requires close comments for critical and high-risk task types", () => {
    expect(requiresCloseComment({ priority: "CRITICAL", type: "MANUAL_TASK" })).toBe(true);
    expect(requiresCloseComment({ priority: "LOW", type: "CHILD_NOT_ADMITTED" })).toBe(true);
    expect(requiresCloseComment({ priority: "LOW", type: "CHILD_TOOK_CREDIT_LESSON" })).toBe(true);
    expect(requiresCloseComment({ priority: "LOW", type: "ATTENDANCE_NOT_FILLED" })).toBe(true);
    expect(requiresCloseComment({ priority: "MEDIUM", type: "MANUAL_TASK" })).toBe(false);
  });

  it("redacts child balance from coach-visible task payloads", () => {
    const task = {
      id: "task-1",
      type: "CHILD_NOT_ADMITTED",
      priority: "CRITICAL",
      title: "Недопуск",
      description: null,
      status: "OPEN",
      assigneeUser: null,
      closedByUser: null,
      relatedEntityType: "Child",
      relatedEntityId: "child-1",
      dueAt: null,
      closedAt: null,
      closedComment: null,
      child: {
        id: "child-1",
        fullName: "Иван Петров",
        admissionStatus: "NOT_ADMITTED",
        cachedLessonBalance: -1
      },
      group: null,
      createdAt: new Date("2026-06-16T10:00:00.000Z")
    } as Parameters<typeof serializeTask>[0];

    const coachVisibleTask = serializeTask(task, { includeFinancialFields: false });

    expect(coachVisibleTask.child).toEqual({
      id: "child-1",
      fullName: "Иван Петров",
      admissionStatus: "NOT_ADMITTED"
    });
    expect(containsCoachForbiddenFinancialField(coachVisibleTask)).toBe(false);
  });
});
