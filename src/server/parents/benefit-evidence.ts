import path from "node:path";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";

export const MAX_BENEFIT_FILE_BYTES = 5 * 1024 * 1024;
export type BenefitEvidenceFile = { originalFileName: string; mimeType: string; fileSizeBytes: number; content: Uint8Array<ArrayBuffer> };

export async function readBenefitEvidence(file: File): Promise<BenefitEvidenceFile> {
  if (!file.size || file.size > MAX_BENEFIT_FILE_BYTES) throw new Error("Документ должен быть непустым и не больше 5 МБ.");
  const content = new Uint8Array(await file.arrayBuffer());
  const buffer = Buffer.from(content);
  const detected = buffer.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? "image/jpeg"
    : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!detected || detected !== file.type) throw new Error("Прикрепите PDF или изображение JPEG, PNG, WebP с корректным содержимым.");
  return { originalFileName: path.basename(file.name.replaceAll("\\", "/")).replace(/[\r\n\x00-\x1f]/g, "").slice(0, 200) || "document", mimeType: detected, fileSizeBytes: content.length, content };
}

export async function loadBenefitEvidence(user: CurrentUser, parentId: string) {
  if (!hasRole(user, ADMIN_ROLES) && user.role !== "PARENT") throw new Error("Недостаточно прав.");
  const prisma = getPrisma();
  const parent = await prisma.parent.findFirstOrThrow({ where: { id: parentId, schoolId: user.schoolId, archivedAt: null }, select: { benefitEvidenceId: true } });
  if (user.role === "PARENT") {
    const account = await prisma.parentAccount.findFirst({ where: { schoolId: user.schoolId, parentId, userId: user.id, status: "ACTIVE" }, select: { id: true } });
    if (!account) throw new Error("Недостаточно прав.");
  }
  if (!parent.benefitEvidenceId) throw new Error("Документ не прикреплён.");
  return prisma.parentBenefitEvidence.findFirstOrThrow({ where: { id: parent.benefitEvidenceId, parentId, schoolId: user.schoolId } });
}
