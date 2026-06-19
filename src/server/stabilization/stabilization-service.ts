import type { TaskStatus } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";

const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

export type StabilizationStatus = "STABLE" | "WATCH" | "BLOCKED";

export type StabilizationCheck = {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  status: StabilizationStatus;
};

export type StabilizationSection = {
  id: string;
  title: string;
  description: string;
  status: StabilizationStatus;
  checks: StabilizationCheck[];
};

export type StabilizationMetric = {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export type StabilizationTaskSummary = {
  id: string;
  type: "MANUAL_TASK";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS";
  dueAt: string | null;
  createdAt: string;
  assigneeName: string | null;
  childName: string | null;
  groupName: string | null;
};

export type StabilizationDashboard = {
  today: string;
  overallStatus: StabilizationStatus;
  attendanceCompletionRate: number | null;
  metrics: StabilizationMetric[];
  sections: StabilizationSection[];
  openPilotIssues: StabilizationTaskSummary[];
  manualRegression: string[];
};

type StabilizationCounts = {
  totalPilotIssues: number;
  openPilotIssues: number;
  openCriticalPilotIssues: number;
  openHighPilotIssues: number;
  openUxPilotIssues: number;
  closedPilotIssues: number;
  openCriticalTasks: number;
  openOperationalTasks: number;
  dueLessons: number;
  completedLessons: number;
  unfilledLessons: number;
  sickPendingWrongDeductions: number;
  pendingSicknessRecords: number;
  confirmedSicknessWithoutMakeup: number;
  approvedVacationWithoutMakeup: number;
  availableMakeups: number;
  makeupAssignmentTasks: number;
  childrenWithDebt: number;
  notAdmittedChildren: number;
  creditLessonChildren: number;
  admissionMismatches: number;
  activeCoaches: number;
  activeAdmins: number;
  auditLogsLast7Days: number;
};

export function percentage(part: number, total: number) {
  if (total <= 0) {
    return null;
  }

  return Math.round((part / total) * 100);
}

export function evaluateStabilizationStatus(checks: StabilizationCheck[]): StabilizationStatus {
  if (checks.some((check) => check.required && check.status === "BLOCKED")) {
    return "BLOCKED";
  }

  if (checks.some((check) => check.status !== "STABLE")) {
    return "WATCH";
  }

  return "STABLE";
}

export function evaluateOverallStatus(sections: StabilizationSection[]): StabilizationStatus {
  if (sections.some((section) => section.status === "BLOCKED")) {
    return "BLOCKED";
  }

  if (sections.some((section) => section.status === "WATCH")) {
    return "WATCH";
  }

  return "STABLE";
}

export function buildStabilizationSections(counts: StabilizationCounts, attendanceCompletionRate: number | null): StabilizationSection[] {
  return [
    buildSection("pilot-issues", "Pilot issue triage", "Критичные pilot-баги и UX/data/training backlog должны быть видны и закрываемы.", [
      requiredCheck("critical-pilot-issues", "Critical pilot blockers", counts.openCriticalPilotIssues === 0, `open critical pilot issues: ${counts.openCriticalPilotIssues}`),
      requiredCheck("global-critical-tasks", "Global critical tasks", counts.openCriticalTasks === 0, `open critical tasks: ${counts.openCriticalTasks}`),
      warningCheck("pilot-issues-captured", "Pilot issue intake used", counts.totalPilotIssues > 0, `pilot issues captured: ${counts.totalPilotIssues}`),
      warningCheck("ux-backlog-visible", "UX backlog visible", counts.openUxPilotIssues > 0 || counts.closedPilotIssues > 0, `open UX pilot issues: ${counts.openUxPilotIssues}`)
    ]),
    buildSection("balance-reconciliation", "Balance reconciliation", "Списания и табели сверяются с реальностью до полного rollout.", [
      requiredCheck("sick-pending-safe", "Sick pending safety", counts.sickPendingWrongDeductions === 0, `wrong sick-pending deductions: ${counts.sickPendingWrongDeductions}`),
      warningCheck("attendance-target", "Attendance completion target", (attendanceCompletionRate ?? 0) >= 95, `attendance completion: ${formatRate(attendanceCompletionRate)}`),
      warningCheck("unfilled-lessons", "Unfilled lessons", counts.unfilledLessons === 0, `unfilled due lessons: ${counts.unfilledLessons}`),
      warningCheck("recent-audit", "Recent audit evidence", counts.auditLogsLast7Days > 0, `audit logs last 7 days: ${counts.auditLogsLast7Days}`)
    ]),
    buildSection("makeups", "Makeups are not lost", "Болезни, отпуска и переносы должны оставлять проверяемый след.", [
      requiredCheck("sickness-makeups", "Confirmed sickness has makeup", counts.confirmedSicknessWithoutMakeup === 0, `confirmed sickness without makeup: ${counts.confirmedSicknessWithoutMakeup}`),
      requiredCheck("vacation-makeups", "Approved vacation has makeup", counts.approvedVacationWithoutMakeup === 0, `approved vacation without makeup: ${counts.approvedVacationWithoutMakeup}`),
      warningCheck("makeup-assignment-queue", "Makeup assignment queue", counts.makeupAssignmentTasks === 0, `makeup assignment tasks: ${counts.makeupAssignmentTasks}`),
      infoCheck("available-makeups", "Available makeups visible", `available makeups: ${counts.availableMakeups}`)
    ]),
    buildSection("debt-admission", "Debt and admission", "Долги и NOT_ADMITTED должны быть понятны админу и не обходиться тренером.", [
      requiredCheck("admission-consistency", "Admission state consistency", counts.admissionMismatches === 0, `admission mismatches: ${counts.admissionMismatches}`),
      warningCheck("debt-visible", "Debt is visible", counts.childrenWithDebt === 0 || counts.creditLessonChildren + counts.notAdmittedChildren > 0, `debt: ${counts.childrenWithDebt}, credit: ${counts.creditLessonChildren}, not admitted: ${counts.notAdmittedChildren}`),
      warningCheck("not-admitted-visible", "NOT_ADMITTED visible", counts.notAdmittedChildren === 0 || counts.openOperationalTasks > 0, `not admitted children: ${counts.notAdmittedChildren}`)
    ]),
    buildSection("operational-usability", "Operational usability", "Тренерский день и работа админа должны проходить без постоянных объяснений.", [
      requiredCheck("pilot-users", "Pilot users exist", counts.activeCoaches >= 1 && counts.activeAdmins >= 1, `active coaches/admins: ${counts.activeCoaches}/${counts.activeAdmins}`),
      warningCheck("operational-task-load", "Operational task load", counts.openOperationalTasks <= 10, `open operational tasks: ${counts.openOperationalTasks}`),
      warningCheck("pending-sickness-load", "Pending sickness load", counts.pendingSicknessRecords <= 5, `pending sickness records: ${counts.pendingSicknessRecords}`),
      infoCheck("manual-coach-phone", "Manual coach phone check", "coach can complete one lesson from phone without developer help"),
      infoCheck("manual-ops-center", "Manual admin trust check", "admin can explain every warning before rollout")
    ])
  ];
}

export async function getStabilizationDashboard(currentUser: CurrentUser): Promise<StabilizationDashboard> {
  assertAdmin(currentUser);

  const prisma = getPrisma();
  const today = dateToKey(new Date());
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const schoolId = currentUser.schoolId;

  const [
    totalPilotIssues,
    openPilotIssues,
    openCriticalPilotIssues,
    openHighPilotIssues,
    openUxPilotIssues,
    closedPilotIssues,
    openCriticalTasks,
    openOperationalTasks,
    dueLessons,
    completedLessons,
    unfilledLessons,
    sickPendingWrongDeductions,
    pendingSicknessRecords,
    confirmedSicknessWithoutMakeup,
    approvedVacationWithoutMakeup,
    availableMakeups,
    makeupAssignmentTasks,
    childrenWithDebt,
    notAdmittedChildren,
    creditLessonChildren,
    admissionMismatches,
    activeCoaches,
    activeAdmins,
    auditLogsLast7Days,
    openPilotIssueRows
  ] = await Promise.all([
    prisma.task.count({ where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" } } }),
    prisma.task.count({ where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" }, status: { in: OPEN_TASK_STATUSES } } }),
    prisma.task.count({
      where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" }, priority: "CRITICAL", status: { in: OPEN_TASK_STATUSES } }
    }),
    prisma.task.count({
      where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" }, priority: "HIGH", status: { in: OPEN_TASK_STATUSES } }
    }),
    prisma.task.count({
      where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot][UX]" }, status: { in: OPEN_TASK_STATUSES } }
    }),
    prisma.task.count({ where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" }, status: { in: ["CLOSED", "CANCELLED"] } } }),
    prisma.task.count({ where: { schoolId, priority: "CRITICAL", status: { in: OPEN_TASK_STATUSES } } }),
    prisma.task.count({ where: { schoolId, type: { not: "MANUAL_TASK" }, status: { in: OPEN_TASK_STATUSES } } }),
    prisma.lesson.count({ where: { schoolId, status: { not: "CANCELLED" }, lessonDate: { lte: todayDate } } }),
    prisma.lesson.count({ where: { schoolId, status: "ATTENDANCE_COMPLETED", lessonDate: { lte: todayDate } } }),
    prisma.lesson.count({ where: { schoolId, status: { in: ["SCHEDULED", "ATTENDANCE_PENDING"] }, lessonDate: { lte: todayDate } } }),
    prisma.lessonBalanceTransaction.count({
      where: {
        schoolId,
        amount: { not: 0 },
        attendanceRecord: { is: { status: "ABSENT_SICK_PENDING" } }
      }
    }),
    prisma.attendanceRecord.count({ where: { lesson: { schoolId }, status: "ABSENT_SICK_PENDING", finalStatus: null } }),
    prisma.attendanceRecord.count({
      where: {
        lesson: { schoolId },
        finalStatus: "ABSENT_SICK_CONFIRMED",
        makeupCredits: { none: { reason: "SICKNESS" } }
      }
    }),
    prisma.attendanceRecord.count({
      where: {
        lesson: { schoolId },
        finalStatus: "ABSENT_VACATION_APPROVED",
        makeupCredits: { none: { reason: "VACATION" } }
      }
    }),
    prisma.makeupCredit.count({ where: { schoolId, status: "AVAILABLE" } }),
    prisma.task.count({ where: { schoolId, type: "MAKEUP_NEEDS_ASSIGNMENT", status: { in: OPEN_TASK_STATUSES } } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", cachedLessonBalance: { lt: 0 } } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", admissionStatus: "NOT_ADMITTED" } }),
    prisma.child.count({ where: { schoolId, status: "ACTIVE", admissionStatus: "CREDIT_LESSON_USED" } }),
    prisma.child.count({
      where: {
        schoolId,
        status: "ACTIVE",
        OR: [
          { cachedLessonBalance: { gte: 0 }, admissionStatus: { not: "ADMITTED" } },
          { cachedLessonBalance: { lt: 0 }, admissionStatus: "ADMITTED" }
        ]
      }
    }),
    prisma.coachProfile.count({ where: { schoolId, user: { status: "ACTIVE" } } }),
    prisma.user.count({ where: { schoolId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } } }),
    prisma.auditLog.count({ where: { schoolId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.task.findMany({
      where: { schoolId, type: "MANUAL_TASK", title: { startsWith: "[Pilot]" }, status: { in: OPEN_TASK_STATUSES } },
      include: {
        assigneeUser: { select: { displayName: true } },
        child: { select: { fullName: true } },
        group: { select: { name: true } }
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 12
    })
  ]);

  const counts: StabilizationCounts = {
    totalPilotIssues,
    openPilotIssues,
    openCriticalPilotIssues,
    openHighPilotIssues,
    openUxPilotIssues,
    closedPilotIssues,
    openCriticalTasks,
    openOperationalTasks,
    dueLessons,
    completedLessons,
    unfilledLessons,
    sickPendingWrongDeductions,
    pendingSicknessRecords,
    confirmedSicknessWithoutMakeup,
    approvedVacationWithoutMakeup,
    availableMakeups,
    makeupAssignmentTasks,
    childrenWithDebt,
    notAdmittedChildren,
    creditLessonChildren,
    admissionMismatches,
    activeCoaches,
    activeAdmins,
    auditLogsLast7Days
  };
  const attendanceCompletionRate = percentage(completedLessons, dueLessons);
  const sections = buildStabilizationSections(counts, attendanceCompletionRate);

  return {
    today,
    overallStatus: evaluateOverallStatus(sections),
    attendanceCompletionRate,
    metrics: buildStabilizationMetrics(counts, attendanceCompletionRate),
    sections,
    openPilotIssues: openPilotIssueRows.map((task) => ({
      id: task.id,
      type: "MANUAL_TASK",
      priority: task.priority,
      title: task.title,
      description: task.description,
      status: task.status as StabilizationTaskSummary["status"],
      dueAt: task.dueAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      assigneeName: task.assigneeUser?.displayName ?? null,
      childName: task.child?.fullName ?? null,
      groupName: task.group?.name ?? null
    })),
    manualRegression: buildManualRegression()
  };
}

function buildSection(id: string, title: string, description: string, checks: StabilizationCheck[]): StabilizationSection {
  return {
    id,
    title,
    description,
    status: evaluateStabilizationStatus(checks),
    checks
  };
}

function requiredCheck(id: string, label: string, passed: boolean, detail: string): StabilizationCheck {
  return { id, label, detail, required: true, status: passed ? "STABLE" : "BLOCKED" };
}

function warningCheck(id: string, label: string, passed: boolean, detail: string): StabilizationCheck {
  return { id, label, detail, required: false, status: passed ? "STABLE" : "WATCH" };
}

function infoCheck(id: string, label: string, detail: string): StabilizationCheck {
  return { id, label, detail, required: false, status: "WATCH" };
}

function buildStabilizationMetrics(counts: StabilizationCounts, attendanceCompletionRate: number | null): StabilizationMetric[] {
  return [
    { label: "Pilot issues open", value: String(counts.openPilotIssues), tone: counts.openCriticalPilotIssues > 0 ? "danger" : counts.openPilotIssues > 0 ? "warning" : "success" },
    { label: "Critical blockers", value: String(counts.openCriticalPilotIssues + counts.openCriticalTasks), tone: counts.openCriticalPilotIssues + counts.openCriticalTasks > 0 ? "danger" : "success" },
    { label: "Attendance", value: formatRate(attendanceCompletionRate), tone: (attendanceCompletionRate ?? 0) >= 95 ? "success" : "warning" },
    { label: "Unfilled lessons", value: String(counts.unfilledLessons), tone: counts.unfilledLessons > 0 ? "danger" : "success" },
    { label: "Wrong sick deductions", value: String(counts.sickPendingWrongDeductions), tone: counts.sickPendingWrongDeductions > 0 ? "danger" : "success" },
    { label: "Makeup anomalies", value: String(counts.confirmedSicknessWithoutMakeup + counts.approvedVacationWithoutMakeup), tone: counts.confirmedSicknessWithoutMakeup + counts.approvedVacationWithoutMakeup > 0 ? "danger" : "success" },
    { label: "Debt / NOT_ADMITTED", value: `${counts.childrenWithDebt}/${counts.notAdmittedChildren}`, tone: counts.admissionMismatches > 0 ? "danger" : counts.childrenWithDebt > 0 ? "warning" : "success" },
    { label: "Audit 7d", value: String(counts.auditLogsLast7Days), tone: counts.auditLogsLast7Days > 0 ? "success" : "warning" }
  ];
}

function buildManualRegression() {
  return [
    "Тренер с телефона открывает сегодняшнее занятие и сохраняет полный табель.",
    "Админ видит результат посещаемости и отсутствие/наличие ATTENDANCE_NOT_FILLED.",
    "PRESENT и ABSENT_UNEXCUSED дают ровно одно списание.",
    "ABSENT_SICK_PENDING не списывает до финального решения.",
    "Подтверждённая болезнь, отпуск и групповое событие создают перенос.",
    "Ребёнок с NOT_ADMITTED не может быть проведён тренером.",
    "COACH UI/API не показывает финансовые поля.",
    "Critical/high pilot tasks закрыты с понятным комментарием.",
    "Операционный центр объясняет все долги, справки, переносы и пробники.",
    "Есть ручной fallback: Excel/manual reconciliation на случай блокера."
  ];
}

function formatRate(rate: number | null) {
  return rate === null ? "n/a" : `${rate}%`;
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}
