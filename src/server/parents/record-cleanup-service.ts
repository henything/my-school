import type { CurrentUser } from "@/server/auth/current-user";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

export async function getParentCleanupPreview(currentUser: CurrentUser, parentId: string) {
  assertRole(currentUser, ADMIN_ROLES);
  const prisma = getPrisma();
  const parent = await prisma.parent.findFirstOrThrow({ where: { id: parentId, schoolId: currentUser.schoolId },
    select: { id: true, fullName: true, phone: true, archivedAt: true, mergedIntoParentId: true,
      children: { select: { id: true, fullName: true, status: true, _count: { select: { attendanceRecords: true, invoices: true, payments: true } } } },
      _count: { select: { invoices: true, payments: true, paymentAttempts: true, invites: true } } }
  });
  return {
    ...parent,
    archivedAt: parent.archivedAt?.toISOString() ?? null,
    activeChildren: parent.children.filter((child) => child.status !== "ARCHIVED").length,
    attendanceCount: parent.children.reduce((sum, child) => sum + child._count.attendanceRecords, 0),
    invoiceCount: parent._count.invoices,
    paymentCount: parent._count.payments
  };
}

export async function getChildCleanupPreview(currentUser: CurrentUser, childId: string) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().child.findFirstOrThrow({ where: { id: childId, schoolId: currentUser.schoolId },
    select: { id: true, fullName: true, status: true, currentGroup: { select: { name: true } },
      parent: { select: { id: true, fullName: true } },
      _count: { select: { attendanceRecords: true, subscriptions: true, invoices: true, payments: true, convertedTrials: true } } }
  });
}

export async function archiveParent(currentUser: CurrentUser, parentId: string, reason: string) {
  assertRole(currentUser, ADMIN_ROLES);
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "parents" WHERE "id" = ${parentId}::uuid FOR UPDATE`;
    const parent = await tx.parent.findFirstOrThrow({ where: { id: parentId, schoolId: currentUser.schoolId, archivedAt: null }, include: { account: true } });
    const activeChildren = await tx.child.count({ where: { parentId, status: { not: "ARCHIVED" } } });
    if (activeChildren > 0) throw new Error("Сначала переведите или архивируйте активных детей родителя.");
    const unresolvedInvoices = await tx.invoice.count({ where: { parentId, status: { in: ["DRAFT", "ISSUED", "OVERDUE", "PARTIALLY_PAID"] } } });
    if (unresolvedInvoices > 0) throw new Error("У родителя есть незакрытые счета. Сначала урегулируйте оплату или объедините карточки.");
    const inFlight = await tx.paymentAttempt.count({ where: { parentId, status: { in: ["CREATED", "REDIRECTED", "PENDING"] } } });
    if (inFlight > 0) throw new Error("У родителя есть незавершённая оплата. Дождитесь результата перед архивированием.");
    await disableSourceAccess(tx, parentId, parent.account?.userId ?? null);
    await tx.parent.update({ where: { id: parentId }, data: { archivedAt: new Date() } });
    await writeAuditLog({ schoolId: currentUser.schoolId, actorUserId: currentUser.id,
      action: "PARENT_ARCHIVED", entityType: "Parent", entityId: parentId,
      oldValue: { archivedAt: null }, newValue: { archivedAt: new Date().toISOString() }, comment: reason }, tx);
    return { archived: true };
  });
}

export async function mergeParents(currentUser: CurrentUser, sourceId: string, targetId: string, reason: string) {
  assertRole(currentUser, ADMIN_ROLES);
  if (sourceId === targetId) throw new Error("Выберите две разные карточки родителей.");
  return getPrisma().$transaction(async (tx) => {
    const sorted = [sourceId, targetId].sort();
    for (const id of sorted) await tx.$queryRaw`SELECT "id" FROM "parents" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const source = await tx.parent.findFirstOrThrow({ where: { id: sourceId, schoolId: currentUser.schoolId, archivedAt: null }, include: { account: true } });
    const target = await tx.parent.findFirstOrThrow({ where: { id: targetId, schoolId: currentUser.schoolId, archivedAt: null }, include: { account: true } });
    const inFlight = await tx.paymentAttempt.count({ where: { parentId: sourceId, status: { in: ["CREATED", "REDIRECTED", "PENDING"] } } });
    if (inFlight) throw new Error("У исходного родителя есть незавершённая оплата. Дождитесь результата перед объединением.");
    const children = await tx.child.count({ where: { parentId: sourceId } });
    const invoices = await tx.invoice.count({ where: { parentId: sourceId } });
    const payments = await tx.payment.count({ where: { parentId: sourceId } });
    await tx.child.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    await tx.invoice.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    await tx.payment.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    await tx.paymentAttempt.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    await tx.billingAdjustment.updateMany({ where: { parentId: sourceId }, data: { parentId: targetId } });
    if (source.account && !target.account && source.phone && source.phone === target.phone) {
      await tx.parentAccount.update({ where: { parentId: sourceId }, data: { parentId: targetId } });
      await tx.parentInvite.updateMany({ where: { parentId: sourceId, usedAt: null }, data: { usedAt: new Date() } });
    } else {
      await disableSourceAccess(tx, sourceId, source.account?.userId ?? null);
    }
    await tx.parent.update({ where: { id: sourceId }, data: { archivedAt: new Date(), mergedIntoParentId: target.id } });
    await writeAuditLog({ schoolId: currentUser.schoolId, actorUserId: currentUser.id,
      action: "PARENTS_MERGED", entityType: "Parent", entityId: sourceId,
      oldValue: { sourceId, sourceName: source.fullName },
      newValue: { targetId, targetName: target.fullName, movedChildren: children, movedInvoices: invoices, movedPayments: payments }, comment: reason }, tx);
    return { targetId, movedChildren: children, movedInvoices: invoices, movedPayments: payments };
  });
}

async function disableSourceAccess(tx: Prisma.TransactionClient, parentId: string, userId: string | null) {
  await tx.parentInvite.updateMany({ where: { parentId, usedAt: null }, data: { usedAt: new Date() } });
  if (userId) {
    await tx.parentAccount.update({ where: { parentId }, data: { status: "BLOCKED", blockedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { status: "INACTIVE" } });
  }
}
