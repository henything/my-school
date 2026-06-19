import { describe, expect, it } from "vitest";
import {
  buildStabilizationSections,
  evaluateOverallStatus,
  evaluateStabilizationStatus,
  percentage,
  type StabilizationCheck
} from "./stabilization-service";

type StabilizationCounts = Parameters<typeof buildStabilizationSections>[0];

function makeCounts(overrides: Partial<StabilizationCounts> = {}): StabilizationCounts {
  return {
    totalPilotIssues: 2,
    openPilotIssues: 0,
    openCriticalPilotIssues: 0,
    openHighPilotIssues: 0,
    openUxPilotIssues: 0,
    closedPilotIssues: 2,
    openCriticalTasks: 0,
    openOperationalTasks: 2,
    dueLessons: 10,
    completedLessons: 10,
    unfilledLessons: 0,
    sickPendingWrongDeductions: 0,
    pendingSicknessRecords: 1,
    confirmedSicknessWithoutMakeup: 0,
    approvedVacationWithoutMakeup: 0,
    availableMakeups: 2,
    makeupAssignmentTasks: 0,
    childrenWithDebt: 1,
    notAdmittedChildren: 1,
    creditLessonChildren: 0,
    admissionMismatches: 0,
    activeCoaches: 1,
    activeAdmins: 1,
    auditLogsLast7Days: 3,
    ...overrides
  };
}

describe("stabilization service", () => {
  it("calculates percentages only when there is a denominator", () => {
    expect(percentage(19, 20)).toBe(95);
    expect(percentage(1, 0)).toBeNull();
  });

  it("blocks only on required blocked checks and watches advisory checks", () => {
    const stableRequired: StabilizationCheck = { id: "required", label: "required", detail: "ok", required: true, status: "STABLE" };
    const watchedAdvisory: StabilizationCheck = { id: "advisory", label: "advisory", detail: "manual", required: false, status: "WATCH" };
    const blockedRequired: StabilizationCheck = { ...stableRequired, status: "BLOCKED" };

    expect(evaluateStabilizationStatus([stableRequired])).toBe("STABLE");
    expect(evaluateStabilizationStatus([stableRequired, watchedAdvisory])).toBe("WATCH");
    expect(evaluateStabilizationStatus([blockedRequired, watchedAdvisory])).toBe("BLOCKED");
  });

  it("keeps the stabilization dashboard in watch while manual checks remain", () => {
    const sections = buildStabilizationSections(makeCounts(), 100);

    expect(evaluateOverallStatus(sections)).toBe("WATCH");
    expect(sections.filter((section) => section.status === "BLOCKED")).toEqual([]);
  });

  it("blocks rollout when critical pilot issues are still open", () => {
    const sections = buildStabilizationSections(makeCounts({ openCriticalPilotIssues: 1 }), 100);
    const issueSection = sections.find((section) => section.id === "pilot-issues");

    expect(issueSection?.status).toBe("BLOCKED");
    expect(evaluateOverallStatus(sections)).toBe("BLOCKED");
  });

  it("blocks stabilization when sick pending deductions or missing makeups are detected", () => {
    const sections = buildStabilizationSections(
      makeCounts({
        sickPendingWrongDeductions: 1,
        confirmedSicknessWithoutMakeup: 1,
        approvedVacationWithoutMakeup: 1
      }),
      100
    );

    expect(sections.find((section) => section.id === "balance-reconciliation")?.status).toBe("BLOCKED");
    expect(sections.find((section) => section.id === "makeups")?.status).toBe("BLOCKED");
    expect(evaluateOverallStatus(sections)).toBe("BLOCKED");
  });

  it("blocks debt and admission when cached balance and admission state disagree", () => {
    const sections = buildStabilizationSections(makeCounts({ admissionMismatches: 1 }), 100);

    expect(sections.find((section) => section.id === "debt-admission")?.status).toBe("BLOCKED");
  });
});
