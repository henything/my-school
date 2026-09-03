import type { InvoiceStatus, PaymentRecordStatus, TaskStatus, TrialStatus } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { countActiveChildren } from "@/server/groups/capacity";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

const PAID_PAYMENT_STATUS: PaymentRecordStatus = "SUCCEEDED";
const NON_DEBT_INVOICE_STATUSES: InvoiceStatus[] = ["PAID", "CANCELLED"];
const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];
const CONVERTED_TRIAL_STATUS: TrialStatus = "CONVERTED_TO_ACTIVE";
const COACH_SALARY_RATE = 0.25;

type AnalyticsGroupRecord = {
  id: string;
  name: string;
  status: string;
  capacityLimit: number;
  branch: { name: string };
  mainCoach: { id: string; user: { displayName: string } };
  children: Array<{ id: string; status: string }>;
};

type MoneyByGroup = {
  groupId: string | null;
  groupName: string;
  branchName: string | null;
  amountKopeks: number;
};

export type AnalyticsDashboard = Awaited<ReturnType<typeof getAnalyticsDashboard>>;

export async function getAnalyticsDashboard(currentUser: CurrentUser) {
  assertRole(currentUser, ADMIN_ROLES);

  const prisma = getPrisma();
  const [groups, totalActiveChildren, payments, invoices, subscriptions, trialCount, convertedTrialCount, attendanceNotFilledCount] = await Promise.all([
    prisma.trainingGroup.findMany({
      where: { schoolId: currentUser.schoolId, status: { not: "ARCHIVED" } },
      include: {
        branch: { select: { name: true } },
        mainCoach: { select: { id: true, user: { select: { displayName: true } } } },
        children: { select: { id: true, status: true } }
      },
      orderBy: [{ name: "asc" }]
    }),
    prisma.child.count({ where: { schoolId: currentUser.schoolId, status: "ACTIVE" } }),
    prisma.payment.findMany({
      where: { schoolId: currentUser.schoolId, status: PAID_PAYMENT_STATUS },
      select: {
        amountKopeks: true,
        child: { select: { currentGroupId: true } }
      }
    }),
    prisma.invoice.findMany({
      where: { schoolId: currentUser.schoolId, status: { notIn: NON_DEBT_INVOICE_STATUSES } },
      select: {
        amountKopeks: true,
        paidAmountKopeks: true,
        parentId: true,
        child: { select: { currentGroupId: true } }
      }
    }),
    prisma.subscription.findMany({
      where: { schoolId: currentUser.schoolId },
      select: {
        totalAmountKopeks: true,
        paymentStatus: true,
        child: { select: { currentGroupId: true } }
      }
    }),
    prisma.trialParticipant.count({ where: { schoolId: currentUser.schoolId } }),
    prisma.trialParticipant.count({ where: { schoolId: currentUser.schoolId, status: CONVERTED_TRIAL_STATUS } }),
    prisma.task.count({
      where: {
        schoolId: currentUser.schoolId,
        type: "ATTENDANCE_NOT_FILLED",
        status: { in: OPEN_TASK_STATUSES }
      }
    })
  ]);

  const groupIndex = createGroupIndex(groups);
  const receiptByGroup = createMoneyRows(groupIndex, payments, (payment) => payment.amountKopeks, (payment) => payment.child.currentGroupId);
  const debtByGroup = createMoneyRows(
    groupIndex,
    invoices,
    (invoice) => Math.max(0, invoice.amountKopeks - invoice.paidAmountKopeks),
    (invoice) => invoice.child.currentGroupId
  );

  const groupRows = groups.map((group) => {
    const activeChildrenCount = countActiveChildren(group.children);
    const receiptAmountKopeks = receiptByGroup.find((row) => row.groupId === group.id)?.amountKopeks ?? 0;
    const debtAmountKopeks = debtByGroup.find((row) => row.groupId === group.id)?.amountKopeks ?? 0;

    return {
      id: group.id,
      name: group.name,
      branchName: group.branch.name,
      coachName: group.mainCoach.user.displayName,
      activeChildrenCount,
      capacityLimit: group.capacityLimit,
      fillPercent: percent(activeChildrenCount, group.capacityLimit),
      receiptAmountKopeks,
      debtAmountKopeks
    };
  });

  const coachRows = Array.from(
    subscriptions.reduce((rows, subscription) => {
      const group = groupIndex.get(subscription.child.currentGroupId ?? "");
      const coachId = group?.mainCoach.id ?? "none";
      const existing = rows.get(coachId) ?? {
        coachId,
        coachName: group?.mainCoach.user.displayName ?? "Без тренера",
        subscriptionAmountKopeks: 0,
        salaryAmountKopeks: 0
      };

      existing.subscriptionAmountKopeks += subscription.totalAmountKopeks;
      existing.salaryAmountKopeks = Math.round(existing.subscriptionAmountKopeks * COACH_SALARY_RATE);
      rows.set(coachId, existing);
      return rows;
    }, new Map<string, { coachId: string; coachName: string; subscriptionAmountKopeks: number; salaryAmountKopeks: number }>())
  )
    .map(([, row]) => row)
    .sort((left, right) => right.salaryAmountKopeks - left.salaryAmountKopeks);

  const totalReceiptAmountKopeks = sum(payments, (payment) => payment.amountKopeks);
  const totalDebtAmountKopeks = sum(invoices, (invoice) => Math.max(0, invoice.amountKopeks - invoice.paidAmountKopeks));
  const totalCapacity = sum(groups, (group) => group.capacityLimit);
  const paidSubscriptionCount = subscriptions.filter((subscription) => subscription.paymentStatus === "PAID").length;
  const debtorCount = new Set(invoices.filter((invoice) => invoice.amountKopeks > invoice.paidAmountKopeks).map((invoice) => invoice.parentId)).size;
  const averageReceiptKopeks = payments.length > 0 ? Math.round(totalReceiptAmountKopeks / payments.length) : 0;

  return {
    totals: {
      totalReceiptAmountKopeks,
      totalDebtAmountKopeks,
      totalActiveChildren,
      totalCapacity,
      fillPercent: percent(totalActiveChildren, totalCapacity),
      paidPercent: percent(paidSubscriptionCount, subscriptions.length),
      debtorCount,
      averageReceiptKopeks,
      trialCount,
      convertedTrialCount,
      trialConversionPercent: percent(convertedTrialCount, trialCount),
      attendanceNotFilledCount
    },
    receiptByGroup,
    debtByGroup,
    groupRows,
    coachRows
  };
}

function createGroupIndex(groups: AnalyticsGroupRecord[]) {
  return new Map(groups.map((group) => [group.id, group]));
}

function createMoneyRows<T>(groups: Map<string, AnalyticsGroupRecord>, items: T[], amountFor: (item: T) => number, groupIdFor: (item: T) => string | null): MoneyByGroup[] {
  const rows = new Map<string, MoneyByGroup>();

  for (const item of items) {
    const groupId = groupIdFor(item);
    const group = groupId ? groups.get(groupId) : null;
    const key = group?.id ?? "none";
    const row = rows.get(key) ?? {
      groupId: group?.id ?? null,
      groupName: group?.name ?? "Без группы",
      branchName: group?.branch.name ?? null,
      amountKopeks: 0
    };

    row.amountKopeks += amountFor(item);
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((left, right) => right.amountKopeks - left.amountKopeks);
}

function sum<T>(items: T[], valueFor: (item: T) => number) {
  return items.reduce((total, item) => total + valueFor(item), 0);
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}
