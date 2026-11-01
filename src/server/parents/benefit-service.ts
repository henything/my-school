import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { BENEFIT_CATEGORIES, type BenefitCategory } from "@/lib/benefits";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

export const reviewBenefitSchema = z.object({
  category: z.enum(BENEFIT_CATEGORIES).nullable(),
  status: z.enum(["APPROVED", "REJECTED", "NONE"]),
  reason: z.string().trim().min(1, "Укажите основание решения.").max(1000),
  expectedUpdatedAt: z.string().datetime()
}).refine(value => value.status === "NONE" || value.category !== null, { message: "Выберите категорию льготы.", path: ["category"] });

export async function requestBenefit(tx: Prisma.TransactionClient, user: CurrentUser, parentId: string, category: BenefitCategory | null | undefined) {
  if (!category) return;
  await tx.$queryRaw`SELECT "id" FROM "parents" WHERE "id" = ${parentId}::uuid AND "school_id" = ${user.schoolId}::uuid FOR UPDATE`;
  const parent = await tx.parent.findFirstOrThrow({ where: { id: parentId, schoolId: user.schoolId, archivedAt: null } });
  if (parent.benefitStatus === "APPROVED" || (parent.benefitCategory === category && parent.benefitStatus === "PENDING")) return;
  await tx.parent.update({ where: { id: parent.id }, data: { benefitCategory: category, benefitStatus: "PENDING", benefitReviewComment: null, benefitReviewedAt: null } });
  await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "PARENT_BENEFIT_REQUESTED", entityType: "Parent", entityId: parent.id, oldValue: { category: parent.benefitCategory, status: parent.benefitStatus }, newValue: { category, status: "PENDING" } }, tx);
}

export async function reviewBenefit(user: CurrentUser, parentId: string, input: z.infer<typeof reviewBenefitSchema>) {
  assertRole(user, ADMIN_ROLES);
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "parents" WHERE "id" = ${parentId}::uuid AND "school_id" = ${user.schoolId}::uuid FOR UPDATE`;
    const parent = await tx.parent.findFirstOrThrow({ where: { id: parentId, schoolId: user.schoolId, archivedAt: null } });
    if (parent.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Данные изменились. Обновите страницу перед решением.");
    if (input.status === "APPROVED" && input.category === "TWO_CHILDREN") {
      const children = await tx.child.count({ where: { schoolId: user.schoolId, parentId, status: { in: ["ACTIVE", "PAUSED", "TRIAL"] } } });
      if (children < 2) throw new Error("Для этой льготы привяжите к одному родителю карточки обоих детей.");
    }
    const updated = await tx.parent.update({ where: { id: parent.id }, data: {
      benefitCategory: input.status === "NONE" ? null : input.category, benefitStatus: input.status,
      benefitReviewComment: input.reason, benefitReviewedAt: new Date()
    } });
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "PARENT_BENEFIT_REVIEWED", entityType: "Parent", entityId: parent.id, oldValue: { category: parent.benefitCategory, status: parent.benefitStatus }, newValue: { category: updated.benefitCategory, status: updated.benefitStatus, reason: input.reason } }, tx);
    return { id: updated.id, status: updated.benefitStatus, category: updated.benefitCategory };
  });
}
