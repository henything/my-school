import type { Prisma } from "@/generated/prisma/client";
import { activeBookingGroup } from "./journey-context";
import { reservationDeadline } from "./test-journey-rules";

/** Group lock must be held by callers that acquire or renew a seat. */
export async function countUnclaimedInvites(tx: Pick<Prisma.TransactionClient, "trialEnrollmentInvite">, groupId: string, now = new Date(), exceptTrialId?: string) {
  return tx.trialEnrollmentInvite.count({ where: {
    claimedAt: null, expiresAt: { gt: now }, trial: { groupId, status: "WANTS_TO_CONTINUE", ...(exceptTrialId ? { id: { not: exceptTrialId } } : {}) }
  } });
}

export async function ensureWalkInInvite(tx: Prisma.TransactionClient, trialId: string, groupId: string) {
  const existing = await tx.trialEnrollmentInvite.findUnique({ where: { trialId } });
  if (existing?.claimedAt) throw new Error("Родитель уже зарегистрировался. Продолжите существующую заявку.");
  if (existing && existing.expiresAt > new Date()) return existing;
  await tx.$queryRaw`SELECT "id" FROM "groups" WHERE "id" = ${groupId}::uuid FOR UPDATE`;
  const group = await tx.trainingGroup.findFirstOrThrow({ where: { id: groupId, ...activeBookingGroup }, select: { capacityLimit: true } });
  const [active, reservations, invites] = await Promise.all([
    tx.child.count({ where: { currentGroupId: groupId, status: "ACTIVE" } }),
    tx.trialTestJourney.count({ where: { paidAt: null, reserveExpiresAt: { gt: new Date() }, trial: { groupId } } }),
    countUnclaimedInvites(tx, groupId, new Date(), trialId)
  ]);
  if (active + reservations + invites >= group.capacityLimit) throw new Error("В группе нет свободного места для резерва.");
  return tx.trialEnrollmentInvite.upsert({ where: { trialId }, create: { trialId, expiresAt: reservationDeadline(new Date()) }, update: { expiresAt: reservationDeadline(new Date()) } });
}

