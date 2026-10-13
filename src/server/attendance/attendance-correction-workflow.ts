import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { applyRecalculationInTransaction, getRecalculationPreview } from "@/server/billing/recalculation-service";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";
import { correctAttendanceInTransaction } from "./attendance-service";
import type { CorrectAttendanceInput } from "./schemas";

type FinancialChange = {
  subscriptionId: string;
  childName: string;
  period: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  previousLessonsCount: number;
  nextLessonsCount: number;
  previousInvoiceAmountKopeks: number | null;
  nextInvoiceAmountKopeks: number;
  addedLessonDates: string[] | null;
  removedLessonDates: string[] | null;
  canApply: boolean;
  canApplyPaid: boolean;
  blockReason: string | null;
  paidDifferenceKopeks: number;
};

type Preview = {
  revision: string;
  changes: FinancialChange[];
  childrenWithoutSubscription: string[];
};

class RollbackPreview extends Error {
  constructor(readonly preview: Preview) { super("rollback preview"); }
}

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function affectedSubscriptions(tx: Prisma.TransactionClient, user: CurrentUser, lessonId: string, input: CorrectAttendanceInput) {
  const lesson = await tx.lesson.findFirstOrThrow({ where: { id: lessonId, schoolId: user.schoolId }, select: {
    id: true, lessonDate: true, updatedAt: true, attendanceRecords: { select: { childId: true, status: true, comment: true, updatedAt: true } }
  } });
  const childIds = input.records.map((record) => record.childId);
  const subscriptions = await tx.subscription.findMany({ where: {
    schoolId: user.schoolId, childId: { in: childIds }, periodStart: { lte: lesson.lessonDate }, periodEnd: { gte: lesson.lessonDate }
  }, select: { id: true, childId: true, updatedAt: true, invoices: { select: { id: true, updatedAt: true } } }, orderBy: { id: "asc" } });
  const currentRevision = fingerprint({ lesson, subscriptions, input });
  return { lesson, subscriptions, currentRevision };
}

async function simulate(tx: Prisma.TransactionClient, user: CurrentUser, lessonId: string, input: CorrectAttendanceInput) {
  const before = await affectedSubscriptions(tx, user, lessonId, input);
  const beforePreviews: Array<Awaited<ReturnType<typeof getRecalculationPreview>>> = [];
  for (const subscription of before.subscriptions) beforePreviews.push(await getRecalculationPreview(user, subscription.id, tx));
  const updatedLesson = await correctAttendanceInTransaction(tx, user, lessonId, input);
  const afterPreviews: Array<Awaited<ReturnType<typeof getRecalculationPreview>>> = [];
  for (const subscription of before.subscriptions) afterPreviews.push(await getRecalculationPreview(user, subscription.id, tx));
  const changes = afterPreviews.flatMap((after, index): FinancialChange[] => {
    const prior = beforePreviews[index];
    if (prior.nextLessons.map((lesson) => lesson.id).sort().join(",") === after.nextLessons.map((lesson) => lesson.id).sort().join(",") &&
        prior.nextInvoiceAmountKopeks === after.nextInvoiceAmountKopeks) return [];
    return [{
      subscriptionId: after.subscriptionId, childName: after.childName, period: after.periodStart.slice(0, 7),
      invoiceNumber: after.invoiceNumber, invoiceStatus: after.invoiceStatus,
      previousLessonsCount: after.previousLessonsCount, nextLessonsCount: after.nextLessonsCount,
      previousInvoiceAmountKopeks: after.previousInvoiceAmountKopeks,
      nextInvoiceAmountKopeks: after.nextInvoiceAmountKopeks,
      addedLessonDates: after.addedLessonDates, removedLessonDates: after.removedLessonDates,
      canApply: after.canApply, canApplyPaid: after.canApplyPaid, blockReason: after.blockReason,
      paidDifferenceKopeks: after.paidDifferenceKopeks
    }];
  });
  const subscribedIds = new Set(before.subscriptions.map((subscription) => subscription.childId));
  const withoutIds = input.records.filter((record) => ["PRESENT", "ABSENT_UNEXCUSED"].includes(record.status) && !subscribedIds.has(record.childId)).map((record) => record.childId);
  const withoutChildren = withoutIds.length ? await tx.child.findMany({ where: { id: { in: withoutIds } }, select: { fullName: true } }) : [];
  const preview = {
    revision: fingerprint({ before: before.currentRevision, outcomes: afterPreviews.map((item) => [item.subscriptionId, item.nextLessons.map((lesson) => lesson.id), item.nextInvoiceAmountKopeks]) }),
    changes,
    childrenWithoutSubscription: withoutChildren.map((child) => child.fullName)
  };
  return { preview, updatedLesson, afterPreviews };
}

export async function previewAttendanceCorrection(user: CurrentUser, lessonId: string, input: CorrectAttendanceInput) {
  assertRole(user, ADMIN_ROLES);
  try {
    await getPrisma().$transaction(async (tx) => {
      const { preview } = await simulate(tx, user, lessonId, input);
      throw new RollbackPreview(preview);
    });
  } catch (error) {
    if (error instanceof RollbackPreview) return error.preview;
    throw error;
  }
  throw new Error("Не удалось рассчитать исправление табеля.");
}

export async function saveAttendanceCorrection(user: CurrentUser, lessonId: string, input: CorrectAttendanceInput, expectedRevision: string, paidDifferenceAction?: "CREDIT" | "REFUND_DUE") {
  assertRole(user, ADMIN_ROLES);
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "lessons" WHERE "id" = ${lessonId}::uuid FOR UPDATE`;
    const { preview, updatedLesson, afterPreviews } = await simulate(tx, user, lessonId, input);
    if (preview.revision !== expectedRevision) throw new Error("Табель или счёт изменился после предварительного расчёта. Проверьте изменения ещё раз.");
    for (const change of preview.changes) {
      const after = afterPreviews.find((item) => item.subscriptionId === change.subscriptionId)!;
      if (!change.canApply && !change.canApplyPaid) throw new Error(`${change.childName}: ${change.blockReason ?? "Счёт требует ручной проверки."}`);
      await applyRecalculationInTransaction(tx, user, change.subscriptionId, {
        reason: input.correctionReason,
        paidDifferenceAction,
        expectedLessonIds: after.nextLessons.map((lesson) => lesson.id),
        expectedSubscriptionUpdatedAt: after.subscriptionUpdatedAt,
        expectedInvoiceUpdatedAt: after.invoiceUpdatedAt!
      });
    }
    return { lesson: updatedLesson, financialChanges: preview.changes.length, childrenWithoutSubscription: preview.childrenWithoutSubscription };
  });
}
