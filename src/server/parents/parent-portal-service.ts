import type { InvoiceStatus, PaymentRecordStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { dateToKey } from "@/server/schedule/generation";
import { getActiveParentAccount } from "./parent-auth-service";

const childSummaryInclude = {
  currentGroup: {
    select: {
      id: true,
      name: true,
      branch: { select: { id: true, name: true, address: true } },
      mainCoach: { select: { id: true, user: { select: { displayName: true } } } }
    }
  },
  subscriptions: {
    orderBy: [{ periodEnd: "desc" as const }, { createdAt: "desc" as const }],
    take: 1
  },
  invoices: {
    orderBy: [{ dueDate: "asc" as const }, { createdAt: "desc" as const }],
    take: 3
  }
};

type ParentChildSummary = Prisma.ChildGetPayload<{ include: typeof childSummaryInclude }>;

export async function getParentDashboard(currentUser: CurrentUser) {
  const account = await getActiveParentAccount(currentUser);
  const children = await getPrisma().child.findMany({
    where: {
      schoolId: currentUser.schoolId,
      parentId: account.parentId,
      status: { not: "ARCHIVED" }
    },
    include: childSummaryInclude,
    orderBy: { fullName: "asc" }
  });

  const childSummaries = [];
  for (const child of children) {
    childSummaries.push({
      ...serializeParentChild(child),
      upcomingLessons: child.currentGroup ? await listUpcomingLessonsForGroup(currentUser.schoolId, child.currentGroup.id, 2) : []
    });
  }

  return {
    parent: {
      id: account.parent.id,
      fullName: account.parent.fullName,
      phone: account.parent.phone,
      vkProfileUrl: account.parent.vkProfileUrl
    },
    children: childSummaries
  };
}

export async function getParentChildDetail(currentUser: CurrentUser, childId: string) {
  const account = await getActiveParentAccount(currentUser);
  const child = await getPrisma().child.findFirstOrThrow({
    where: {
      id: childId,
      schoolId: currentUser.schoolId,
      parentId: account.parentId,
      status: { not: "ARCHIVED" }
    },
    include: {
      ...childSummaryInclude,
      attendanceRecords: {
        include: {
          lesson: {
            select: {
              id: true,
              lessonDate: true,
              startTime: true,
              endTime: true,
              status: true,
              group: { select: { id: true, name: true } },
              branch: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      makeupCredits: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 20
      }
    }
  });

  return {
    ...serializeParentChild(child),
    upcomingLessons: child.currentGroup ? await listUpcomingLessonsForGroup(currentUser.schoolId, child.currentGroup.id, 8) : [],
    attendance: child.attendanceRecords.map((record) => ({
      id: record.id,
      lessonId: record.lesson.id,
      lessonDate: dateToKey(record.lesson.lessonDate),
      startTime: record.lesson.startTime,
      endTime: record.lesson.endTime,
      lessonStatus: record.lesson.status,
      group: record.lesson.group,
      branch: record.lesson.branch,
      status: record.status,
      finalStatus: record.finalStatus
    })),
    makeups: child.makeupCredits.map((makeup) => ({
      id: makeup.id,
      reason: makeup.reason,
      status: makeup.status,
      assignedDate: makeup.assignedDate ? dateToKey(makeup.assignedDate) : null,
      usedAt: makeup.usedAt?.toISOString() ?? null
    }))
  };
}

export async function listParentInvoices(currentUser: CurrentUser) {
  const account = await getActiveParentAccount(currentUser);
  const invoices = await getPrisma().invoice.findMany({
    where: {
      schoolId: currentUser.schoolId,
      parentId: account.parentId
    },
    include: {
      child: { select: { id: true, fullName: true } },
      payments: { orderBy: { createdAt: "desc" } }
    },
    orderBy: [{ status: "asc" }, { dueDate: "desc" }, { createdAt: "desc" }]
  });

  return invoices.map(serializeInvoice);
}

async function listUpcomingLessonsForGroup(schoolId: string, groupId: string, limit: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lessons = await getPrisma().lesson.findMany({
    where: {
      schoolId,
      groupId,
      lessonDate: { gte: today },
      status: { not: "CANCELLED" }
    },
    select: {
      id: true,
      lessonDate: true,
      startTime: true,
      endTime: true,
      status: true,
      branch: { select: { id: true, name: true, address: true } },
      group: { select: { id: true, name: true } },
      coach: { select: { user: { select: { displayName: true } } } },
      substituteCoach: { select: { user: { select: { displayName: true } } } }
    },
    orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
    take: limit
  });

  return lessons.map((lesson) => ({
    id: lesson.id,
    lessonDate: dateToKey(lesson.lessonDate),
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    status: lesson.status,
    branch: lesson.branch,
    group: lesson.group,
    coachName: lesson.substituteCoach?.user.displayName ?? lesson.coach.user.displayName
  }));
}

function serializeParentChild(child: ParentChildSummary) {
  const latestSubscription = child.subscriptions[0] ?? null;
  const openInvoices = child.invoices.filter((invoice) => !["PAID", "CANCELLED"].includes(invoice.status));

  return {
    id: child.id,
    fullName: child.fullName,
    birthDate: child.birthDate ? dateToKey(child.birthDate) : null,
    status: child.status,
    admissionStatus: child.admissionStatus,
    lessonBalance: child.cachedLessonBalance,
    makeupBalance: child.cachedMakeupBalance,
    currentGroup: child.currentGroup
      ? {
          id: child.currentGroup.id,
          name: child.currentGroup.name,
          branch: child.currentGroup.branch,
          coachName: child.currentGroup.mainCoach.user.displayName
        }
      : null,
    latestSubscription: latestSubscription
      ? {
          id: latestSubscription.id,
          periodStart: dateToKey(latestSubscription.periodStart),
          periodEnd: dateToKey(latestSubscription.periodEnd),
          plannedLessonsCount: latestSubscription.plannedLessonsCount,
          totalAmountKopeks: latestSubscription.totalAmountKopeks,
          paymentStatus: latestSubscription.paymentStatus
        }
      : null,
    openInvoices: openInvoices.map(serializeInvoiceSummary)
  };
}

function serializeInvoiceSummary(invoice: {
  id: string;
  number: string;
  status: InvoiceStatus;
  amountKopeks: number;
  paidAmountKopeks: number;
  dueDate: Date;
}) {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    amountKopeks: invoice.amountKopeks,
    paidAmountKopeks: invoice.paidAmountKopeks,
    remainingAmountKopeks: invoice.amountKopeks - invoice.paidAmountKopeks,
    dueDate: dateToKey(invoice.dueDate)
  };
}

function serializeInvoice(invoice: {
  id: string;
  number: string;
  status: InvoiceStatus;
  amountKopeks: number;
  paidAmountKopeks: number;
  dueDate: Date;
  issuedAt: Date;
  paidAt: Date | null;
  child: { id: string; fullName: string };
  payments: Array<{
    id: string;
    status: PaymentRecordStatus;
    provider: string;
    amountKopeks: number;
    paidAt: Date | null;
    failureReason: string | null;
    createdAt: Date;
  }>;
}) {
  return {
    ...serializeInvoiceSummary(invoice),
    issuedAt: invoice.issuedAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    child: invoice.child,
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      amountKopeks: payment.amountKopeks,
      paidAt: payment.paidAt?.toISOString() ?? null,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString()
    }))
  };
}
