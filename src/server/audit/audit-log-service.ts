import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { canSeeAuditLog } from "@/server/rbac/rbac";

const auditLogInclude = {
  actor: { select: { id: true, displayName: true, login: true, role: true } }
} as const;

type AuditLogRecord = Prisma.AuditLogGetPayload<{ include: typeof auditLogInclude }>;

export function serializeAuditLog(log: AuditLogRecord) {
  return {
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    oldValue: log.oldValue,
    newValue: log.newValue,
    comment: log.comment,
    actor: log.actor,
    createdAt: log.createdAt.toISOString()
  };
}

export async function listAuditLogs(currentUser: CurrentUser, limit = 200) {
  assertCanReadAuditLog(currentUser);

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const logs = await getPrisma().auditLog.findMany({
    where: { schoolId: currentUser.schoolId },
    include: auditLogInclude,
    orderBy: { createdAt: "desc" },
    take: safeLimit
  });

  return logs.map(serializeAuditLog);
}

function assertCanReadAuditLog(currentUser: CurrentUser) {
  if (!canSeeAuditLog(currentUser)) {
    throw new Error("Журнал аудита доступен только администратору.");
  }
}
