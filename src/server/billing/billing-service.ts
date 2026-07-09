import { randomBytes } from "node:crypto";
import type {
  AdmissionStatus,
  BalanceTransactionType,
  BalanceType,
  CoachAttendanceStatus,
  InvoiceStatus,
  PaymentRecordStatus,
  PaymentStatus,
  TaskPriority,
  TaskStatus,
  TaskType
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { attendanceBalanceDelta, debitTransactionTypeForStatus, desiredAttendanceLessonBalanceNet } from "@/server/attendance/effects";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import {
  admissionStatusAfterLessonBalance,
  calculateSubscriptionTotal,
  canUseCreditLesson,
  DEFAULT_LESSON_PRICE_KOPEKS
} from "./calculations";
import type {
  AdmissionStatusJobInput,
  CreateInvoiceInput,
  CreateSubscriptionInput,
  MarkInvoicePaidInput,
  ManualBalanceAdjustmentInput,
  UpdatePaymentStatusInput
} from "./schemas";

const OPEN_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

const invoiceInclude = {
  parent: { select: { id: true, fullName: true, phone: true } },
  child: { select: { id: true, fullName: true, admissionStatus: true, cachedLessonBalance: true } },
  subscription: { select: { id: true, paymentStatus: true, periodStart: true, periodEnd: true } },
  payments: { orderBy: { createdAt: "desc" } },
  createdBy: { select: { id: true, displayName: true, login: true } }
} as const;

type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

type PaymentRecord = {
  id: string;
  invoiceId: string;
  parentId: string;
  childId: string;
  subscriptionId: string | null;
  provider: string;
  providerPaymentId: string | null;
  status: PaymentRecordStatus;
  amountKopeks: number;
  currency: string;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  invoice: { number: string };
  child: { fullName: string };
  parent: { fullName: string | null; phone: string | null };
};

type SubscriptionListRecord = {
  id: string;
  childId: string;
  periodStart: Date;
  periodEnd: Date;
  plannedLessonsCount: number;
  lessonPriceKopeks: number;
  totalAmountKopeks: number;
  paymentStatus: PaymentStatus;
  paymentStatusChangedAt: Date | null;
  paymentStatusComment: string | null;
  createdAt: Date;
  child: {
    id: string;
    fullName: string;
    admissionStatus: AdmissionStatus;
    cachedLessonBalance: number;
    cachedMakeupBalance: number;
  };
  createdBy: {
    id: string;
    displayName: string;
    login: string;
  };
};

type BalanceTransactionRecord = {
  id: string;
  childId: string;
  lessonId: string | null;
  attendanceRecordId: string | null;
  subscriptionId: string | null;
  type: BalanceTransactionType;
  balanceType: BalanceType;
  amount: number;
  reason: string | null;
  comment: string | null;
  createdAt: Date;
  createdBy?: { displayName: string; login: string } | null;
};

type AttendanceBalanceLesson = {
  id: string;
  schoolId: string;
  lessonDate: Date;
  startTime: string;
  endTime: string;
  group: {
    id: string;
    name: string;
    children: Array<{ id: string; fullName: string }>;
  };
};

type AttendanceBalanceRecord = {
  id: string;
  childId: string;
  status: CoachAttendanceStatus;
};

export { DEFAULT_LESSON_PRICE_KOPEKS };

export function serializeSubscription(subscription: SubscriptionListRecord) {
  return {
    id: subscription.id,
    childId: subscription.childId,
    child: subscription.child,
    periodStart: dateToKey(subscription.periodStart),
    periodEnd: dateToKey(subscription.periodEnd),
    plannedLessonsCount: subscription.plannedLessonsCount,
    lessonPriceKopeks: subscription.lessonPriceKopeks,
    totalAmountKopeks: subscription.totalAmountKopeks,
    paymentStatus: subscription.paymentStatus,
    paymentStatusChangedAt: subscription.paymentStatusChangedAt?.toISOString() ?? null,
    paymentStatusComment: subscription.paymentStatusComment,
    createdBy: subscription.createdBy,
    createdAt: subscription.createdAt.toISOString()
  };
}

export function serializeBalanceTransaction(transaction: BalanceTransactionRecord) {
  return {
    id: transaction.id,
    childId: transaction.childId,
    lessonId: transaction.lessonId,
    attendanceRecordId: transaction.attendanceRecordId,
    subscriptionId: transaction.subscriptionId,
    type: transaction.type,
    balanceType: transaction.balanceType,
    amount: transaction.amount,
    reason: transaction.reason,
    comment: transaction.comment,
    createdBy: transaction.createdBy ?? null,
    createdAt: transaction.createdAt.toISOString()
  };
}

export function serializeInvoice(invoice: InvoiceRecord) {
  return {
    id: invoice.id,
    parentId: invoice.parentId,
    childId: invoice.childId,
    subscriptionId: invoice.subscriptionId,
    number: invoice.number,
    status: invoice.status,
    amountKopeks: invoice.amountKopeks,
    paidAmountKopeks: invoice.paidAmountKopeks,
    remainingAmountKopeks: invoice.amountKopeks - invoice.paidAmountKopeks,
    currency: invoice.currency,
    periodStart: invoice.periodStart ? dateToKey(invoice.periodStart) : null,
    periodEnd: invoice.periodEnd ? dateToKey(invoice.periodEnd) : null,
    dueDate: dateToKey(invoice.dueDate),
    issuedAt: invoice.issuedAt.toISOString(),
    paidAt: invoice.paidAt?.toISOString() ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    parent: invoice.parent,
    child: invoice.child,
    subscription: invoice.subscription
      ? {
          id: invoice.subscription.id,
          paymentStatus: invoice.subscription.paymentStatus,
          periodStart: dateToKey(invoice.subscription.periodStart),
          periodEnd: dateToKey(invoice.subscription.periodEnd)
        }
      : null,
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      amountKopeks: payment.amountKopeks,
      paidAt: payment.paidAt?.toISOString() ?? null,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString()
    })),
    createdBy: invoice.createdBy,
    createdAt: invoice.createdAt.toISOString()
  };
}

export function serializePayment(payment: PaymentRecord) {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    invoiceNumber: payment.invoice.number,
    parentId: payment.parentId,
    parent: payment.parent,
    childId: payment.childId,
    child: payment.child,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    status: payment.status,
    amountKopeks: payment.amountKopeks,
    currency: payment.currency,
    paidAt: payment.paidAt?.toISOString() ?? null,
    failedAt: payment.failedAt?.toISOString() ?? null,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString()
  };
}

export async function listSubscriptions(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const subscriptions = await getPrisma().subscription.findMany({
    where: { schoolId: currentUser.schoolId },
    include: subscriptionListInclude,
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }]
  });

  return subscriptions.map(serializeSubscription);
}

export async function listBalanceTransactions(currentUser: CurrentUser, limit = 80) {
  assertAdmin(currentUser);

  const transactions = await getPrisma().lessonBalanceTransaction.findMany({
    where: { schoolId: currentUser.schoolId },
    include: {
      createdBy: { select: { displayName: true, login: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return transactions.map(serializeBalanceTransaction);
}

export async function listInvoices(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const invoices = await getPrisma().invoice.findMany({
    where: { schoolId: currentUser.schoolId },
    include: invoiceInclude,
    orderBy: [{ status: "asc" }, { dueDate: "desc" }, { createdAt: "desc" }]
  });

  return invoices.map(serializeInvoice);
}

export async function listPayments(currentUser: CurrentUser, limit = 100) {
  assertAdmin(currentUser);

  const payments = await getPrisma().payment.findMany({
    where: { schoolId: currentUser.schoolId },
    include: {
      invoice: { select: { number: true } },
      child: { select: { fullName: true } },
      parent: { select: { fullName: true, phone: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return payments.map(serializePayment);
}

export async function createInvoiceFromSubscription(currentUser: CurrentUser, input: CreateInvoiceInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const subscription = await tx.subscription.findFirstOrThrow({
      where: {
        id: input.subscriptionId,
        schoolId: currentUser.schoolId
      },
      include: {
        child: {
          include: {
            parent: true
          }
        }
      }
    });

    if (!subscription.child.parentId || !subscription.child.parent) {
      throw new Error("Нельзя создать счёт: у ребёнка нет родителя.");
    }

    const existingOpenInvoice = await tx.invoice.findFirst({
      where: {
        schoolId: currentUser.schoolId,
        subscriptionId: subscription.id,
        status: { notIn: ["PAID", "CANCELLED"] }
      }
    });

    if (existingOpenInvoice) {
      throw new Error("По этому абонементу уже есть открытый счёт.");
    }

    const invoice = await tx.invoice.create({
      data: {
        schoolId: currentUser.schoolId,
        parentId: subscription.child.parentId,
        childId: subscription.childId,
        subscriptionId: subscription.id,
        number: createInvoiceNumber(),
        amountKopeks: subscription.totalAmountKopeks,
        paidAmountKopeks: 0,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        dueDate: input.dueDate,
        createdByUserId: currentUser.id
      },
      include: invoiceInclude
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        paymentStatus: "INVOICED",
        paymentStatusChangedAt: new Date(),
        paymentStatusComment: `Создан счёт ${invoice.number}`
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "INVOICE_CREATED",
        entityType: "Invoice",
        entityId: invoice.id,
        newValue: serializeInvoice(invoice)
      },
      tx
    );

    return serializeInvoice(invoice);
  });
}

export async function markInvoicePaidManually(currentUser: CurrentUser, invoiceId: string, input: MarkInvoicePaidInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: {
        id: invoiceId,
        schoolId: currentUser.schoolId
      },
      include: invoiceInclude
    });

    if (invoice.status === "PAID") {
      throw new Error("Счёт уже оплачен.");
    }

    if (invoice.status === "CANCELLED") {
      throw new Error("Отменённый счёт нельзя оплатить.");
    }

    const remainingAmount = invoice.amountKopeks - invoice.paidAmountKopeks;
    const amountKopeks = input.amountKopeks ?? remainingAmount;

    if (amountKopeks <= 0 || amountKopeks > remainingAmount) {
      throw new Error("Сумма оплаты должна быть больше 0 и не больше остатка по счёту.");
    }

    const paidAmountKopeks = invoice.paidAmountKopeks + amountKopeks;
    const nextInvoiceStatus: InvoiceStatus = paidAmountKopeks >= invoice.amountKopeks ? "PAID" : "PARTIALLY_PAID";
    const nextPaymentStatus: PaymentStatus = nextInvoiceStatus === "PAID" ? "PAID" : "PARTIALLY_PAID";

    await tx.payment.create({
      data: {
        schoolId: currentUser.schoolId,
        invoiceId: invoice.id,
        parentId: invoice.parentId,
        childId: invoice.childId,
        subscriptionId: invoice.subscriptionId,
        provider: "MANUAL",
        status: "SUCCEEDED",
        amountKopeks,
        paidAt: new Date()
      }
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmountKopeks,
        status: nextInvoiceStatus,
        paidAt: nextInvoiceStatus === "PAID" ? new Date() : null
      },
      include: invoiceInclude
    });

    if (invoice.subscriptionId) {
      await tx.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          paymentStatus: nextPaymentStatus,
          paymentStatusChangedAt: new Date(),
          paymentStatusComment: input.comment
        }
      });
    }

    if (nextInvoiceStatus === "PAID") {
      await tx.child.update({
        where: { id: invoice.childId },
        data: {
          admissionStatus: admissionStatusAfterLessonBalance(invoice.child.cachedLessonBalance, invoice.child.admissionStatus)
        }
      });
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "INVOICE_MARKED_PAID_MANUALLY",
        entityType: "Invoice",
        entityId: invoice.id,
        oldValue: {
          status: invoice.status,
          paidAmountKopeks: invoice.paidAmountKopeks
        },
        newValue: {
          status: updatedInvoice.status,
          paidAmountKopeks: updatedInvoice.paidAmountKopeks,
          amountKopeks
        },
        comment: input.comment
      },
      tx
    );

    return serializeInvoice(updatedInvoice);
  });
}

export async function getChildBalance(currentUser: CurrentUser, childId: string) {
  assertAdmin(currentUser);

  const child = await getPrisma().child.findFirstOrThrow({
    where: {
      id: childId,
      schoolId: currentUser.schoolId
    },
    select: {
      id: true,
      fullName: true,
      admissionStatus: true,
      cachedLessonBalance: true,
      cachedMakeupBalance: true,
      subscriptions: {
        include: subscriptionListInclude,
        orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }]
      },
      lessonBalanceTransactions: {
        include: {
          createdBy: { select: { displayName: true, login: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 80
      }
    }
  });

  return {
    id: child.id,
    fullName: child.fullName,
    admissionStatus: child.admissionStatus,
    cachedLessonBalance: child.cachedLessonBalance,
    cachedMakeupBalance: child.cachedMakeupBalance,
    subscriptions: child.subscriptions.map(serializeSubscription),
    transactions: child.lessonBalanceTransactions.map(serializeBalanceTransaction)
  };
}

export async function createSubscription(currentUser: CurrentUser, input: CreateSubscriptionInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const child = await tx.child.findFirstOrThrow({
      where: {
        id: input.childId,
        schoolId: currentUser.schoolId,
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        fullName: true,
        currentGroupId: true,
        cachedLessonBalance: true,
        admissionStatus: true
      }
    });

    const plannedLessonsCount =
      input.plannedLessonsCount ??
      (await countRemainingLessonsForChild(tx, currentUser.schoolId, child.currentGroupId, input.periodStart, input.periodEnd));

    if (plannedLessonsCount <= 0) {
      throw new Error("Для абонемента нужно хотя бы одно запланированное занятие.");
    }

    const totalAmountKopeks = calculateSubscriptionTotal(plannedLessonsCount, input.lessonPriceKopeks);
    const subscription = await tx.subscription.create({
      data: {
        schoolId: currentUser.schoolId,
        childId: child.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        plannedLessonsCount,
        lessonPriceKopeks: input.lessonPriceKopeks,
        totalAmountKopeks,
        paymentStatus: input.paymentStatus,
        createdByUserId: currentUser.id
      },
      include: subscriptionListInclude
    });

    const transaction = await tx.lessonBalanceTransaction.create({
      data: {
        schoolId: currentUser.schoolId,
        childId: child.id,
        subscriptionId: subscription.id,
        type: "SUBSCRIPTION_CREATED",
        balanceType: "LESSON_BALANCE",
        amount: plannedLessonsCount,
        reason: "SUBSCRIPTION_CREATED",
        createdByUserId: currentUser.id,
        comment: `Абонемент ${dateToKey(input.periodStart)}-${dateToKey(input.periodEnd)}`
      }
    });

    const nextBalance = child.cachedLessonBalance + plannedLessonsCount;
    await tx.child.update({
      where: { id: child.id },
      data: {
        cachedLessonBalance: { increment: plannedLessonsCount },
        admissionStatus: admissionStatusAfterLessonBalance(nextBalance, child.admissionStatus)
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "SUBSCRIPTION_CREATED",
        entityType: "Subscription",
        entityId: subscription.id,
        newValue: serializeSubscription(subscription)
      },
      tx
    );

    await auditBalanceTransaction(tx, currentUser, transaction.id, {
      childId: child.id,
      subscriptionId: subscription.id,
      amount: plannedLessonsCount,
      type: "SUBSCRIPTION_CREATED"
    });

    return serializeSubscription(subscription);
  });
}

export async function updateChildPaymentStatus(currentUser: CurrentUser, childId: string, input: UpdatePaymentStatusInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    await tx.child.findFirstOrThrow({
      where: {
        id: childId,
        schoolId: currentUser.schoolId
      },
      select: { id: true }
    });

    const existing = await tx.subscription.findFirstOrThrow({
      where: {
        childId,
        schoolId: currentUser.schoolId
      },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      include: subscriptionListInclude
    });

    const updated = await tx.subscription.update({
      where: { id: existing.id },
      data: {
        paymentStatus: input.status,
        paymentStatusChangedAt: new Date(),
        paymentStatusComment: input.comment
      },
      include: subscriptionListInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "PAYMENT_STATUS_UPDATED",
        entityType: "Subscription",
        entityId: updated.id,
        oldValue: {
          paymentStatus: existing.paymentStatus,
          paymentStatusChangedAt: existing.paymentStatusChangedAt?.toISOString() ?? null,
          paymentStatusComment: existing.paymentStatusComment
        },
        newValue: {
          paymentStatus: updated.paymentStatus,
          paymentStatusChangedAt: updated.paymentStatusChangedAt?.toISOString() ?? null,
          paymentStatusComment: updated.paymentStatusComment
        },
        comment: input.comment
      },
      tx
    );

    return serializeSubscription(updated);
  });
}

export async function createManualBalanceAdjustment(currentUser: CurrentUser, childId: string, input: ManualBalanceAdjustmentInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const child = await tx.child.findFirstOrThrow({
      where: {
        id: childId,
        schoolId: currentUser.schoolId
      },
      select: {
        id: true,
        cachedLessonBalance: true,
        cachedMakeupBalance: true,
        admissionStatus: true
      }
    });

    const transaction = await tx.lessonBalanceTransaction.create({
      data: {
        schoolId: currentUser.schoolId,
        childId: child.id,
        type: "MANUAL_ADJUSTMENT",
        balanceType: input.balanceType,
        amount: input.amount,
        reason: "MANUAL_ADJUSTMENT",
        createdByUserId: currentUser.id,
        comment: input.comment
      },
      include: {
        createdBy: { select: { displayName: true, login: true } }
      }
    });

    const nextLessonBalance = input.balanceType === "LESSON_BALANCE" ? child.cachedLessonBalance + input.amount : child.cachedLessonBalance;
    const nextMakeupBalance = input.balanceType === "MAKEUP_BALANCE" ? child.cachedMakeupBalance + input.amount : child.cachedMakeupBalance;

    await tx.child.update({
      where: { id: child.id },
      data: {
        cachedLessonBalance: input.balanceType === "LESSON_BALANCE" ? { increment: input.amount } : undefined,
        cachedMakeupBalance: input.balanceType === "MAKEUP_BALANCE" ? { increment: input.amount } : undefined,
        admissionStatus:
          input.balanceType === "LESSON_BALANCE"
            ? admissionStatusAfterLessonBalance(nextLessonBalance, child.admissionStatus)
            : undefined
      }
    });

    await auditBalanceTransaction(tx, currentUser, transaction.id, {
      childId: child.id,
      balanceType: input.balanceType,
      amount: input.amount,
      type: "MANUAL_ADJUSTMENT",
      comment: input.comment,
      nextLessonBalance,
      nextMakeupBalance
    });

    return serializeBalanceTransaction(transaction);
  });
}

export async function applyAttendanceBalanceEffect(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  lesson: AttendanceBalanceLesson,
  record: AttendanceBalanceRecord
) {
  const aggregate = await tx.lessonBalanceTransaction.aggregate({
    _sum: { amount: true },
    where: {
      attendanceRecordId: record.id,
      balanceType: "LESSON_BALANCE"
    }
  });
  const currentNet = aggregate._sum.amount ?? 0;
  const delta = attendanceBalanceDelta(record.status, currentNet);

  if (delta === 0) {
    return null;
  }

  const child = await tx.child.findFirstOrThrow({
    where: {
      id: record.childId,
      schoolId: currentUser.schoolId
    },
    select: {
      id: true,
      fullName: true,
      cachedLessonBalance: true,
      admissionStatus: true
    }
  });

  if (delta < 0 && record.status === "PRESENT" && child.admissionStatus === "NOT_ADMITTED") {
    throw new Error("Ребёнок не допущен к занятию.");
  }

  const nextLessonBalance = child.cachedLessonBalance + delta;

  if (delta < 0 && nextLessonBalance < -1) {
    throw new Error("Баланс занятий не может уйти ниже -1.");
  }

  const isCreditLesson = delta < 0 && record.status === "PRESENT" && canUseCreditLesson(child.cachedLessonBalance, child.admissionStatus);
  const transactionType = attendanceTransactionType(record.status, delta, isCreditLesson);
  const nextAdmissionStatus = isCreditLesson
    ? "CREDIT_LESSON_USED"
    : admissionStatusAfterLessonBalance(nextLessonBalance, child.admissionStatus);

  const transaction = await tx.lessonBalanceTransaction.create({
    data: {
      schoolId: currentUser.schoolId,
      childId: record.childId,
      lessonId: lesson.id,
      attendanceRecordId: record.id,
      type: transactionType,
      balanceType: "LESSON_BALANCE",
      amount: delta,
      reason: record.status,
      createdByUserId: currentUser.id,
      comment: delta < 0 ? "Списание по табелю" : "Коррекция табеля"
    }
  });

  await tx.child.update({
    where: { id: record.childId },
    data: {
      cachedLessonBalance: { increment: delta },
      admissionStatus: nextAdmissionStatus
    }
  });

  await auditBalanceTransaction(tx, currentUser, transaction.id, {
    childId: record.childId,
    lessonId: lesson.id,
    attendanceRecordId: record.id,
    amount: delta,
    desiredNet: desiredAttendanceLessonBalanceNet(record.status),
    status: record.status,
    type: transactionType
  });

  if (isCreditLesson) {
    const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);

    await ensureTask(tx, {
      schoolId: currentUser.schoolId,
      type: "CHILD_TOOK_CREDIT_LESSON",
      priority: "CRITICAL",
      assigneeUserId: adminUserId,
      relatedEntityType: "Child",
      relatedEntityId: child.id,
      childId: child.id,
      groupId: lesson.group.id,
      title: `Кредитное занятие: ${child.fullName}`,
      description: `${lesson.group.name}, ${dateToKey(lesson.lessonDate)} ${lesson.startTime}-${lesson.endTime}`
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "CHILD_CREDIT_LESSON_USED",
        entityType: "Child",
        entityId: child.id,
        oldValue: {
          admissionStatus: child.admissionStatus,
          cachedLessonBalance: child.cachedLessonBalance
        },
        newValue: {
          admissionStatus: "CREDIT_LESSON_USED",
          cachedLessonBalance: nextLessonBalance
        }
      },
      tx
    );
  }

  return transaction;
}

export async function runAdmissionStatusCheck(currentUser: CurrentUser, input: AdmissionStatusJobInput = {}) {
  assertAdmin(currentUser);

  const now = input.now ?? new Date();
  const todayKey = dateToKey(now);

  return getPrisma().$transaction(async (tx) => {
    const adminUserId = await findAdminAssigneeUserId(tx, currentUser.schoolId);
    const children = await tx.child.findMany({
      where: {
        schoolId: currentUser.schoolId,
        status: "ACTIVE",
        cachedLessonBalance: { lte: -1 },
        admissionStatus: { not: "NOT_ADMITTED" },
        currentGroupId: { not: null }
      },
      select: {
        id: true,
        fullName: true,
        currentGroupId: true,
        admissionStatus: true,
        cachedLessonBalance: true,
        currentGroup: { select: { id: true, name: true } }
      }
    });

    let updatedCount = 0;
    let createdTaskCount = 0;

    for (const child of children) {
      if (!child.currentGroupId) {
        continue;
      }

      const latestSubscription = await tx.subscription.findFirst({
        where: {
          schoolId: currentUser.schoolId,
          childId: child.id
        },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        select: { id: true, paymentStatus: true }
      });

      if (latestSubscription?.paymentStatus === "PAID") {
        continue;
      }

      const latestCredit = await tx.lessonBalanceTransaction.findFirst({
        where: {
          schoolId: currentUser.schoolId,
          childId: child.id,
          type: "CREDIT_LESSON_USED",
          lessonId: { not: null }
        },
        include: {
          lesson: { select: { lessonDate: true, startTime: true } }
        },
        orderBy: { createdAt: "desc" }
      });

      if (!latestCredit?.lesson) {
        continue;
      }

      const nextLesson = await tx.lesson.findFirst({
        where: {
          schoolId: currentUser.schoolId,
          groupId: child.currentGroupId,
          status: { not: "CANCELLED" },
          OR: [
            { lessonDate: { gt: latestCredit.lesson.lessonDate } },
            {
              lessonDate: latestCredit.lesson.lessonDate,
              startTime: { gt: latestCredit.lesson.startTime }
            }
          ]
        },
        orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
        select: { id: true, lessonDate: true, startTime: true }
      });

      if (!nextLesson || dateToKey(nextLesson.lessonDate) > todayKey) {
        continue;
      }

      await tx.child.update({
        where: { id: child.id },
        data: { admissionStatus: "NOT_ADMITTED" }
      });

      const taskResult = await ensureTask(tx, {
        schoolId: currentUser.schoolId,
        type: "CHILD_NOT_ADMITTED",
        priority: "CRITICAL",
        assigneeUserId: adminUserId,
        relatedEntityType: "Child",
        relatedEntityId: child.id,
        childId: child.id,
        groupId: child.currentGroupId,
        title: `Недопуск: ${child.fullName}`,
        description: `${child.currentGroup?.name ?? "Группа"}, следующий урок ${dateToKey(nextLesson.lessonDate)} ${nextLesson.startTime}`
      });

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "CHILD_ADMISSION_STATUS_UPDATED",
          entityType: "Child",
          entityId: child.id,
          oldValue: {
            admissionStatus: child.admissionStatus,
            cachedLessonBalance: child.cachedLessonBalance
          },
          newValue: {
            admissionStatus: "NOT_ADMITTED",
            latestSubscriptionId: latestSubscription?.id ?? null,
            latestSubscriptionPaymentStatus: latestSubscription?.paymentStatus ?? null
          }
        },
        tx
      );

      updatedCount += 1;
      createdTaskCount += Number(taskResult.created);
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "ADMISSION_STATUS_CHECK_RUN",
        entityType: "Child",
        newValue: {
          checkedCount: children.length,
          updatedCount,
          createdTaskCount,
          now: now.toISOString()
        }
      },
      tx
    );

    return { checkedCount: children.length, updatedCount, createdTaskCount };
  });
}

const subscriptionListInclude = {
  child: {
    select: {
      id: true,
      fullName: true,
      admissionStatus: true,
      cachedLessonBalance: true,
      cachedMakeupBalance: true
    }
  },
  createdBy: {
    select: {
      id: true,
      displayName: true,
      login: true
    }
  }
} as const;

async function countRemainingLessonsForChild(
  tx: Prisma.TransactionClient,
  schoolId: string,
  currentGroupId: string | null,
  periodStart: Date,
  periodEnd: Date
) {
  if (!currentGroupId) {
    return 0;
  }

  return tx.lesson.count({
    where: {
      schoolId,
      groupId: currentGroupId,
      lessonDate: {
        gte: periodStart,
        lte: periodEnd
      },
      status: { not: "CANCELLED" }
    }
  });
}

function attendanceTransactionType(status: CoachAttendanceStatus, delta: number, isCreditLesson: boolean): BalanceTransactionType {
  if (delta > 0) {
    return "ATTENDANCE_DEDUCTION_REVERSAL";
  }

  return isCreditLesson ? "CREDIT_LESSON_USED" : debitTransactionTypeForStatus(status);
}

async function auditBalanceTransaction(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  transactionId: string,
  newValue: Prisma.InputJsonValue
) {
  return writeAuditLog(
    {
      schoolId: currentUser.schoolId,
      actorUserId: currentUser.id,
      action: "LESSON_BALANCE_TRANSACTION_CREATED",
      entityType: "LessonBalanceTransaction",
      entityId: transactionId,
      newValue
    },
    tx
  );
}

async function findAdminAssigneeUserId(tx: Prisma.TransactionClient, schoolId: string) {
  const admin = await tx.user.findFirst({
    where: {
      schoolId,
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE"
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });

  return admin?.id ?? null;
}

async function ensureTask(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    type: TaskType;
    priority: TaskPriority;
    assigneeUserId: string | null;
    relatedEntityType: string;
    relatedEntityId: string;
    childId?: string | null;
    groupId?: string | null;
    title: string;
    description?: string | null;
  }
) {
  const existing = await tx.task.findFirst({
    where: {
      schoolId: input.schoolId,
      type: input.type,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      assigneeUserId: input.assigneeUserId,
      status: { in: OPEN_TASK_STATUSES }
    }
  });

  if (existing) {
    return { task: existing, created: false };
  }

  const task = await tx.task.create({
    data: {
      schoolId: input.schoolId,
      type: input.type,
      priority: input.priority,
      assigneeUserId: input.assigneeUserId,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      childId: input.childId ?? null,
      groupId: input.groupId ?? null,
      title: input.title,
      description: input.description ?? null
    }
  });

  return { task, created: true };
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}

function createInvoiceNumber() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `INV-${datePart}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
