import type { TaskPriority } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";

export type ReadinessGateStatus = "READY" | "NEEDS_ATTENTION" | "BLOCKED";

export type ReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
};

export type ReadinessGate = {
  id: string;
  title: string;
  description: string;
  status: ReadinessGateStatus;
  checks: ReadinessCheck[];
};

export type ReadinessMetric = {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export type ReadinessManualSection = {
  title: string;
  items: string[];
};

type ReadinessCounts = {
  activeAdmins: number;
  activeCoaches: number;
  activeBranches: number;
  activeGroups: number;
  activeChildren: number;
  scheduleTemplates: number;
  lessons: number;
  futureLessons: number;
  dueLessons: number;
  completedLessons: number;
  attendanceRecords: number;
  attendanceNotFilledTasks: number;
  subscriptions: number;
  lessonBalanceTransactions: number;
  presentDeductions: number;
  unexcusedDeductions: number;
  sickPendingWrongDeductions: number;
  makeupCredits: number;
  sicknessMakeups: number;
  vacationMakeups: number;
  groupEventMakeups: number;
  groupEvents: number;
  childrenWithDebt: number;
  notAdmittedChildren: number;
  openTasks: number;
  openCriticalTasks: number;
  operationalTasks: number;
  trials: number;
  trialTasks: number;
  auditLogs: number;
  importedBatches: number;
  pilotIssueTasks: number;
};

export type ReadinessDashboard = {
  today: string;
  attendanceCompletionRate: number | null;
  gates: ReadinessGate[];
  metrics: ReadinessMetric[];
  manualSections: ReadinessManualSection[];
  pilotIssueDefaults: {
    titlePrefix: string;
    priority: TaskPriority;
  };
};

export function percentage(part: number, total: number) {
  if (total <= 0) {
    return null;
  }

  return Math.round((part / total) * 100);
}

export function evaluateReadinessGate(checks: ReadinessCheck[]): ReadinessGateStatus {
  if (checks.some((check) => check.required && !check.passed)) {
    return "BLOCKED";
  }

  if (checks.some((check) => !check.passed)) {
    return "NEEDS_ATTENTION";
  }

  return "READY";
}

export function buildReadinessGates(counts: ReadinessCounts, attendanceCompletionRate: number | null): ReadinessGate[] {
  const pilotScopeOk = counts.activeBranches >= 1 && counts.activeBranches <= 2 && counts.activeGroups >= 2 && counts.activeGroups <= 4;

  return [
    buildGate("gate-1", "Gate 1 - Internal demo", "Login, roles, directories, schedule and first coach lesson.", [
      requiredCheck("auth-users", counts.activeAdmins >= 1, `active admins: ${counts.activeAdmins}`),
      requiredCheck("coach-user", counts.activeCoaches >= 1, `active coaches: ${counts.activeCoaches}`),
      requiredCheck("branches", counts.activeBranches >= 1, `active branches: ${counts.activeBranches}`),
      requiredCheck("groups", counts.activeGroups >= 1, `active groups: ${counts.activeGroups}`),
      requiredCheck("children", counts.activeChildren >= 1, `active children: ${counts.activeChildren}`),
      requiredCheck("schedule", counts.scheduleTemplates >= 1, `schedule templates: ${counts.scheduleTemplates}`),
      requiredCheck("lessons", counts.lessons >= 1, `lessons: ${counts.lessons}`)
    ]),
    buildGate("gate-2", "Gate 2 - Attendance pilot", "Coach attendance flow and admin visibility.", [
      requiredCheck("coach-lessons", counts.lessons >= 1 && counts.activeCoaches >= 1, `lessons: ${counts.lessons}`),
      requiredCheck("attendance-records", counts.attendanceRecords >= 1, `marked attendance records: ${counts.attendanceRecords}`),
      requiredCheck("attendance-complete", counts.completedLessons >= 1, `completed lessons: ${counts.completedLessons}`),
      advisoryCheck("attendance-task", counts.attendanceNotFilledTasks >= 1, `attendance-not-filled tasks: ${counts.attendanceNotFilledTasks}`),
      advisoryCheck("attendance-rate", (attendanceCompletionRate ?? 0) >= 95, `attendance completion: ${formatRate(attendanceCompletionRate)}`)
    ]),
    buildGate("gate-3", "Gate 3 - Balance pilot", "Subscriptions, deductions, sick-pending safety and audit evidence.", [
      requiredCheck("subscriptions", counts.subscriptions >= 1, `subscriptions: ${counts.subscriptions}`),
      requiredCheck("balance-transactions", counts.lessonBalanceTransactions >= 1, `balance transactions: ${counts.lessonBalanceTransactions}`),
      requiredCheck("present-deductions", counts.presentDeductions >= 1, `present deductions: ${counts.presentDeductions}`),
      requiredCheck("unexcused-deductions", counts.unexcusedDeductions >= 1, `unexcused deductions: ${counts.unexcusedDeductions}`),
      requiredCheck("sick-pending-safe", counts.sickPendingWrongDeductions === 0, `wrong sick-pending deductions: ${counts.sickPendingWrongDeductions}`),
      requiredCheck("audit", counts.auditLogs >= 1, `audit logs: ${counts.auditLogs}`)
    ]),
    buildGate("gate-4", "Gate 4 - Operational pilot", "Makeups, debt, not-admitted, tasks, operational center and trials.", [
      requiredCheck("makeups", counts.makeupCredits >= 1, `makeups: ${counts.makeupCredits}`),
      advisoryCheck("sickness-makeups", counts.sicknessMakeups >= 1, `sickness makeups: ${counts.sicknessMakeups}`),
      advisoryCheck("vacation-makeups", counts.vacationMakeups >= 1, `vacation makeups: ${counts.vacationMakeups}`),
      advisoryCheck("group-events", counts.groupEvents >= 1 || counts.groupEventMakeups >= 1, `group events: ${counts.groupEvents}`),
      requiredCheck("debt", counts.childrenWithDebt >= 1, `children with debt: ${counts.childrenWithDebt}`),
      requiredCheck("not-admitted", counts.notAdmittedChildren >= 1, `not admitted children: ${counts.notAdmittedChildren}`),
      requiredCheck("tasks", counts.openTasks >= 1 || counts.operationalTasks >= 1, `open tasks: ${counts.openTasks}`),
      advisoryCheck("trials", counts.trials >= 1 || counts.trialTasks >= 1, `trials: ${counts.trials}`)
    ]),
    buildGate("gate-5", "Gate 5 - Full internal rollout", "Pilot passed, critical issues closed, mobile coach flow and RBAC checked.", [
      requiredCheck("pilot-scope", pilotScopeOk, `pilot scope: ${counts.activeBranches} branches, ${counts.activeGroups} groups`),
      requiredCheck("critical-bugs", counts.openCriticalTasks === 0, `open critical tasks: ${counts.openCriticalTasks}`),
      requiredCheck("attendance-95", (attendanceCompletionRate ?? 0) >= 95, `attendance completion: ${formatRate(attendanceCompletionRate)}`),
      requiredCheck("sick-pending-safe", counts.sickPendingWrongDeductions === 0, `wrong sick-pending deductions: ${counts.sickPendingWrongDeductions}`),
      advisoryCheck("pilot-issues-tracked", counts.pilotIssueTasks >= 1, `pilot issue tasks: ${counts.pilotIssueTasks}`),
      advisoryCheck("starting-data", counts.importedBatches >= 1 || counts.activeChildren >= 1, `imported batches: ${counts.importedBatches}`)
    ])
  ];
}

export async function getReadinessDashboard(currentUser: CurrentUser): Promise<ReadinessDashboard> {
  assertAdmin(currentUser);

  const prisma = getPrisma();
  const today = dateToKey(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const schoolId = currentUser.schoolId;

  const [
    activeAdmins,
    activeCoaches,
    activeBranches,
    activeGroups,
    activeChildren,
    scheduleTemplates,
    lessons,
    futureLessons,
    dueLessons,
    completedLessons,
    attendanceRecords,
    attendanceNotFilledTasks,
    subscriptions,
    lessonBalanceTransactions,
    presentDeductions,
    unexcusedDeductions,
    sickPendingWrongDeductions,
    makeupCredits,
    sicknessMakeups,
    vacationMakeups,
    groupEventMakeups,
    groupEvents,
    childrenWithDebt,
    notAdmittedChildren,
    openTasks,
    openCriticalTasks,
    operationalTasks,
    trials,
    trialTasks,
    auditLogs,
    importedBatches,
    pilotIssueTasks
  ] = await Promise.all([
    prisma.user.count({ where: { schoolId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } } }),
    prisma.coachProfile.count({ where: { schoolId, user: { status: "ACTIVE" } } }),
    prisma.branch.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.trainingGroup.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", currentGroupId: { not: null } } }),
    prisma.scheduleTemplate.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.lesson.count({ where: { schoolId, status: { not: "CANCELLED" } } }),
    prisma.lesson.count({ where: { schoolId, status: { not: "CANCELLED" }, lessonDate: { gt: todayDate } } }),
    prisma.lesson.count({ where: { schoolId, status: { not: "CANCELLED" }, lessonDate: { lte: todayDate } } }),
    prisma.lesson.count({ where: { schoolId, status: "ATTENDANCE_COMPLETED", lessonDate: { lte: todayDate } } }),
    prisma.attendanceRecord.count({ where: { lesson: { schoolId }, status: { not: "NOT_MARKED" } } }),
    prisma.task.count({ where: { schoolId, type: "ATTENDANCE_NOT_FILLED" } }),
    prisma.subscription.count({ where: { schoolId } }),
    prisma.lessonBalanceTransaction.count({ where: { schoolId } }),
    prisma.lessonBalanceTransaction.count({ where: { schoolId, type: "PRESENT_DEDUCTION" } }),
    prisma.lessonBalanceTransaction.count({ where: { schoolId, type: "UNEXCUSED_ABSENCE_DEDUCTION" } }),
    prisma.lessonBalanceTransaction.count({
      where: {
        schoolId,
        amount: { not: 0 },
        attendanceRecord: { is: { status: "ABSENT_SICK_PENDING" } }
      }
    }),
    prisma.makeupCredit.count({ where: { schoolId } }),
    prisma.makeupCredit.count({ where: { schoolId, reason: "SICKNESS" } }),
    prisma.makeupCredit.count({ where: { schoolId, reason: "VACATION" } }),
    prisma.makeupCredit.count({ where: { schoolId, groupEventId: { not: null } } }),
    prisma.groupEvent.count({ where: { schoolId } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", cachedLessonBalance: { lt: 0 } } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", admissionStatus: "NOT_ADMITTED" } }),
    prisma.task.count({ where: { schoolId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.task.count({ where: { schoolId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: "CRITICAL" } }),
    prisma.task.count({ where: { schoolId, type: { not: "MANUAL_TASK" } } }),
    prisma.trialParticipant.count({ where: { schoolId } }),
    prisma.task.count({ where: { schoolId, type: "TRIAL_NEEDS_PROCESSING" } }),
    prisma.auditLog.count({ where: { schoolId } }),
    countImportedBatches(prisma, schoolId),
    prisma.task.count({ where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" } } })
  ]);

  const counts: ReadinessCounts = {
    activeAdmins,
    activeCoaches,
    activeBranches,
    activeGroups,
    activeChildren,
    scheduleTemplates,
    lessons,
    futureLessons,
    dueLessons,
    completedLessons,
    attendanceRecords,
    attendanceNotFilledTasks,
    subscriptions,
    lessonBalanceTransactions,
    presentDeductions,
    unexcusedDeductions,
    sickPendingWrongDeductions,
    makeupCredits,
    sicknessMakeups,
    vacationMakeups,
    groupEventMakeups,
    groupEvents,
    childrenWithDebt,
    notAdmittedChildren,
    openTasks,
    openCriticalTasks,
    operationalTasks,
    trials,
    trialTasks,
    auditLogs,
    importedBatches,
    pilotIssueTasks
  };
  const attendanceCompletionRate = percentage(completedLessons, dueLessons);

  return {
    today,
    attendanceCompletionRate,
    gates: buildReadinessGates(counts, attendanceCompletionRate),
    metrics: buildReadinessMetrics(counts, attendanceCompletionRate),
    manualSections: buildManualSections(),
    pilotIssueDefaults: {
      titlePrefix: "[Pilot]",
      priority: "HIGH"
    }
  };
}

function buildGate(id: string, title: string, description: string, checks: ReadinessCheck[]): ReadinessGate {
  return {
    id,
    title,
    description,
    status: evaluateReadinessGate(checks),
    checks
  };
}

function requiredCheck(id: string, passed: boolean, detail: string): ReadinessCheck {
  return { id, label: id, passed, required: true, detail };
}

function advisoryCheck(id: string, passed: boolean, detail: string): ReadinessCheck {
  return { id, label: id, passed, required: false, detail };
}

function buildReadinessMetrics(counts: ReadinessCounts, attendanceCompletionRate: number | null): ReadinessMetric[] {
  return [
    { label: "Филиалы / группы", value: `${counts.activeBranches}/${counts.activeGroups}`, tone: counts.activeBranches >= 1 && counts.activeGroups >= 1 ? "success" : "danger" },
    { label: "Тренеры / админы", value: `${counts.activeCoaches}/${counts.activeAdmins}`, tone: counts.activeCoaches >= 1 && counts.activeAdmins >= 1 ? "success" : "danger" },
    { label: "Дети в группах", value: String(counts.activeChildren), tone: counts.activeChildren >= 1 ? "success" : "warning" },
    { label: "Занятия", value: `${counts.lessons} total / ${counts.futureLessons} future`, tone: counts.lessons >= 1 ? "success" : "danger" },
    { label: "Табель", value: formatRate(attendanceCompletionRate), tone: (attendanceCompletionRate ?? 0) >= 95 ? "success" : "warning" },
    { label: "Списания", value: String(counts.lessonBalanceTransactions), tone: counts.lessonBalanceTransactions >= 1 ? "success" : "warning" },
    { label: "Переносы", value: String(counts.makeupCredits), tone: counts.makeupCredits >= 1 ? "success" : "warning" },
    { label: "Открытые critical", value: String(counts.openCriticalTasks), tone: counts.openCriticalTasks === 0 ? "success" : "danger" },
    { label: "Audit log", value: String(counts.auditLogs), tone: counts.auditLogs >= 1 ? "success" : "danger" },
    { label: "Pilot issues", value: String(counts.pilotIssueTasks), tone: counts.pilotIssueTasks >= 1 ? "neutral" : "warning" }
  ];
}

function buildManualSections(): ReadinessManualSection[] {
  return [
    {
      title: "Pilot scope",
      items: ["1-2 филиала", "2-4 группы", "1-2 тренера", "1 админ", "период 1-2 недели"]
    },
    {
      title: "Training checklist",
      items: ["админ создает данные и расписание", "тренер открывает урок с телефона", "тренер сохраняет табель", "админ закрывает critical/high задачи"]
    },
    {
      title: "Daily reconciliation",
      items: ["сверить заполненные табели", "сверить списания и баланс", "сверить болезни и переносы", "сверить NOT_ADMITTED и долги", "занести баги/UX в Pilot intake"]
    },
    {
      title: "Stabilization pass",
      items: ["закрыть critical bugs", "проверить RBAC тренера", "проверить audit/correction flow", "подтвердить ежедневный backup и restore drill", "оставить Excel/manual fallback на пилот"]
    }
  ];
}

function formatRate(rate: number | null) {
  return rate === null ? "n/a" : `${rate}%`;
}

async function countImportedBatches(prisma: ReturnType<typeof getPrisma>, schoolId: string) {
  try {
    return await prisma.importBatch.count({ where: { schoolId, status: "IMPORTED" } });
  } catch (error) {
    if (isMissingTableError(error)) {
      return 0;
    }

    throw error;
  }
}

function isMissingTableError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === "P2021";
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}
