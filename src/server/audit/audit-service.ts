import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";

export type AuditLogInput = {
  schoolId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  comment?: string | null;
};

export async function writeAuditLog(input: AuditLogInput, tx: Prisma.TransactionClient = getPrisma()) {
  return tx.auditLog.create({
    data: {
      schoolId: input.schoolId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      comment: input.comment ?? null
    }
  });
}
