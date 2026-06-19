import { describe, expect, it } from "vitest";
import { buildReadinessGates, evaluateReadinessGate, percentage, type ReadinessCheck } from "./readiness-service";

type ReadinessCounts = Parameters<typeof buildReadinessGates>[0];

function makeCounts(overrides: Partial<ReadinessCounts> = {}): ReadinessCounts {
  return {
    activeAdmins: 1,
    activeCoaches: 1,
    activeBranches: 1,
    activeGroups: 2,
    activeChildren: 8,
    scheduleTemplates: 1,
    lessons: 10,
    futureLessons: 4,
    dueLessons: 6,
    completedLessons: 6,
    attendanceRecords: 20,
    attendanceNotFilledTasks: 1,
    subscriptions: 8,
    lessonBalanceTransactions: 12,
    presentDeductions: 8,
    unexcusedDeductions: 1,
    sickPendingWrongDeductions: 0,
    makeupCredits: 3,
    sicknessMakeups: 1,
    vacationMakeups: 1,
    groupEventMakeups: 1,
    groupEvents: 1,
    childrenWithDebt: 1,
    notAdmittedChildren: 1,
    openTasks: 2,
    openCriticalTasks: 0,
    operationalTasks: 2,
    trials: 1,
    trialTasks: 1,
    auditLogs: 5,
    importedBatches: 1,
    pilotIssueTasks: 1,
    ...overrides
  };
}

describe("readiness service", () => {
  it("calculates percentages only when a total exists", () => {
    expect(percentage(19, 20)).toBe(95);
    expect(percentage(0, 0)).toBeNull();
  });

  it("blocks gates on failed required checks and only warns on failed advisory checks", () => {
    const advisoryFailure: ReadinessCheck = {
      id: "advisory",
      label: "advisory",
      passed: false,
      required: false,
      detail: "optional evidence missing"
    };
    const requiredFailure: ReadinessCheck = {
      ...advisoryFailure,
      id: "required",
      label: "required",
      required: true
    };

    expect(evaluateReadinessGate([{ ...requiredFailure, passed: true }, { ...advisoryFailure, passed: true }])).toBe("READY");
    expect(evaluateReadinessGate([{ ...requiredFailure, passed: true }, advisoryFailure])).toBe("NEEDS_ATTENTION");
    expect(evaluateReadinessGate([requiredFailure, { ...advisoryFailure, passed: true }])).toBe("BLOCKED");
  });

  it("maps DEV-10 acceptance gates to ready statuses for a complete pilot data set", () => {
    const gates = buildReadinessGates(makeCounts(), 100);

    expect(gates.map((gate) => [gate.id, gate.status])).toEqual([
      ["gate-1", "READY"],
      ["gate-2", "READY"],
      ["gate-3", "READY"],
      ["gate-4", "READY"],
      ["gate-5", "READY"]
    ]);
  });

  it("blocks balance pilot when sick-pending attendance has a deduction", () => {
    const gate = buildReadinessGates(makeCounts({ sickPendingWrongDeductions: 1 }), 100).find((item) => item.id === "gate-3");

    expect(gate?.status).toBe("BLOCKED");
    expect(gate?.checks.find((check) => check.id === "sick-pending-safe")?.passed).toBe(false);
  });

  it("blocks full rollout when pilot scope, critical bugs, or attendance rate fail", () => {
    const gate = buildReadinessGates(makeCounts({ activeBranches: 3, openCriticalTasks: 1 }), 80).find((item) => item.id === "gate-5");

    expect(gate?.status).toBe("BLOCKED");
    expect(gate?.checks.filter((check) => check.required && !check.passed).map((check) => check.id)).toEqual([
      "pilot-scope",
      "critical-bugs",
      "attendance-95"
    ]);
  });
});
