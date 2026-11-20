import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { todayInMoscow } from "@/server/children/attendance-plan";
import { writeAuditLog } from "@/server/audit/audit-service";
import { branchTariffInputSchema, monthDate, priceForMonth, PricingConflict, TariffNotFound, type BranchTariffInput } from "./branch-tariff-rules";

function assertAdmin(user: CurrentUser) {
  if (!hasRole(user, ADMIN_ROLES)) throw new Error("Недостаточно прав для изменения тарифов.");
}
async function branchForSchool(tx: Prisma.TransactionClient, schoolId: string, branchId: string) {
  const branch = await tx.branch.findFirst({ where: { id: branchId, schoolId } });
  if (!branch) throw new TariffNotFound("Филиал не найден.");
  return branch;
}
export async function resolveBranchTariff(tx: Prisma.TransactionClient, schoolId: string, branchId: string, periodStart: Date) {
  await branchForSchool(tx, schoolId, branchId);
  await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
  const tariffs = await tx.branchTariff.findMany({ where: { schoolId, branchId, effectiveMonth: { lte: monthDate(periodStart.toISOString().slice(0, 7)) } }, orderBy: { effectiveMonth: "desc" }, take: 1 });
  const resolved = priceForMonth(tariffs, periodStart);
  return { pricingSource: resolved.tariff ? "BRANCH_TARIFF" as const : "DEFAULT" as const,
    pricingBranchId: branchId, branchTariffId: resolved.tariff?.id ?? null,
    branchTariffVersion: resolved.tariff?.version ?? null, lessonPriceKopeks: resolved.lessonPriceKopeks };
}
export async function listBranchTariffs(user: CurrentUser, branchId: string, month: string) {
  assertAdmin(user);
  const target = monthDate(month);
  return getPrisma().$transaction(async tx => {
    const branch = await branchForSchool(tx, user.schoolId, branchId);
    const tariffs = await tx.branchTariff.findMany({ where: { schoolId: user.schoolId, branchId }, orderBy: { effectiveMonth: "desc" }, include: { updatedBy: { select: { displayName: true } } } });
    const changes = await tx.auditLog.findMany({ where: { schoolId: user.schoolId, entityType: "BranchTariff", entityId: { in: tariffs.map(t => t.id) } }, orderBy: { createdAt: "desc" }, include: { actor: { select: { displayName: true } } } });
    const currentMonth = todayInMoscow().toISOString().slice(0, 7);
    const selected = priceForMonth(tariffs, target);
    return { branch: { id: branch.id, name: branch.name, status: branch.status }, month, currentMonth,
      lessonPriceKopeks: selected.lessonPriceKopeks, pricingSource: selected.tariff ? "BRANCH_TARIFF" : "DEFAULT",
      tariffs: tariffs.map(t => ({ id: t.id, effectiveMonth: t.effectiveMonth.toISOString().slice(0, 7), lessonPriceKopeks: t.lessonPriceKopeks, version: t.version, updatedAt: t.updatedAt.toISOString(), author: t.updatedBy.displayName, canEdit: t.effectiveMonth.toISOString().slice(0, 7) >= currentMonth })),
      changes: changes.map(c => ({ id: c.id, oldValue: c.oldValue, newValue: c.newValue, author: c.actor?.displayName ?? "Система", createdAt: c.createdAt.toISOString() })) };
  });
}
export async function saveBranchTariff(user: CurrentUser, branchId: string, raw: BranchTariffInput) {
  assertAdmin(user);
  const input = branchTariffInputSchema.parse(raw);
  const effectiveMonth = monthDate(input.effectiveMonth);
  if (input.effectiveMonth < todayInMoscow().toISOString().slice(0, 7)) throw new Error("Тариф завершённого месяца доступен только для просмотра.");
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId}::uuid AND school_id = ${user.schoolId}::uuid FOR UPDATE`;
    const branch = await branchForSchool(tx, user.schoolId, branchId);
    if (branch.status !== "ACTIVE") throw new Error("Изменять тариф можно только у активного филиала.");
    const existing = await tx.branchTariff.findUnique({ where: { schoolId_branchId_effectiveMonth: { schoolId: user.schoolId, branchId, effectiveMonth } } });
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new PricingConflict("Тариф уже изменён. Обновите данные и проверьте цену.");
    const tariff = existing ? await tx.branchTariff.update({ where: { id: existing.id }, data: { lessonPriceKopeks: input.lessonPriceKopeks, updatedByUserId: user.id, version: { increment: 1 } } }) : await tx.branchTariff.create({ data: { schoolId: user.schoolId, branchId, effectiveMonth, lessonPriceKopeks: input.lessonPriceKopeks, createdByUserId: user.id, updatedByUserId: user.id } });
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: existing ? "BRANCH_TARIFF_UPDATED" : "BRANCH_TARIFF_CREATED", entityType: "BranchTariff", entityId: tariff.id,
      oldValue: existing ? { effectiveMonth: input.effectiveMonth, lessonPriceKopeks: existing.lessonPriceKopeks, version: existing.version } : null,
      newValue: { branchId, effectiveMonth: input.effectiveMonth, lessonPriceKopeks: tariff.lessonPriceKopeks, version: tariff.version } }, tx);
    return { id: tariff.id, effectiveMonth: input.effectiveMonth, lessonPriceKopeks: tariff.lessonPriceKopeks, version: tariff.version };
  });
}
