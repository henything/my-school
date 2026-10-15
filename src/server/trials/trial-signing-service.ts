import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { writeAuditLog } from "@/server/audit/audit-service";
import { assertFdocConfigured, fdocSignedPdf, fdocStatus, sendFdocPackage } from "./fdoc-client";

function assertAccess(user: CurrentUser, coachUserId: string) {
  if (!hasRole(user, ADMIN_ROLES) && !(user.role === "COACH" && user.id === coachUserId)) {
    throw new Error("Нет доступа к пробному занятию.");
  }
}

function normalizePhone(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length !== 11 || !"78".includes(digits[0])) throw new Error("Укажите номер родителя в формате +7 и 10 цифр.");
  return `+7${digits.slice(1)}`;
}

function publicError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 250) : "Ошибка F.Doc.";
}

export async function startTrialSigning(user: CurrentUser, trialId: string) {
  const prisma = getPrisma();
  const trial = await prisma.trialParticipant.findFirstOrThrow({
    where: { id: trialId, schoolId: user.schoolId },
    include: { coach: { select: { userId: true } } }
  });
  assertAccess(user, trial.coach.userId);
  if (trial.status !== "TRIAL_ATTENDED" || trial.trialAttended !== true) {
    throw new Error("Сначала отметьте, что ребёнок посетил пробное занятие.");
  }
  if (!trial.childName || !trial.parentName || !trial.parentPhone) {
    throw new Error("Для отправки нужны имя ребёнка, ФИО и телефон родителя.");
  }
  assertFdocConfigured();
  const parentPhone = normalizePhone(trial.parentPhone);

  const signing = await prisma.trialSigningPackage.upsert({
    where: { trialId },
    create: { schoolId: user.schoolId, trialId },
    update: {}
  });
  if (signing.status !== "PENDING") return signing;

  // Claim the package before the external call; a repeat click cannot send a second SMS.
  const claim = await prisma.trialSigningPackage.updateMany({
    where: { id: signing.id, status: "PENDING" },
    data: { status: "SENT" }
  });
  if (!claim.count) return prisma.trialSigningPackage.findUniqueOrThrow({ where: { id: signing.id } });

  try {
    const ids = await sendFdocPackage(signing.id, {
      childName: trial.childName,
      parentName: trial.parentName,
      parentPhone
    });
    const updated = await prisma.trialSigningPackage.update({
      where: { id: signing.id },
      data: { ...ids, status: "WAITING", sentAt: new Date(), errorMessage: null }
    });
    await writeAuditLog({ schoolId: user.schoolId, actorUserId: user.id, action: "TRIAL_SIGNING_SENT", entityType: "TrialSigningPackage", entityId: signing.id });
    return updated;
  } catch (error) {
    await prisma.trialSigningPackage.update({ where: { id: signing.id }, data: { status: "ERROR", errorMessage: publicError(error) } });
    throw error;
  }
}

function overallStatus(statuses: string[]) {
  if (statuses.every((status) => status === "SIGNED")) return "SIGNED" as const;
  if (statuses.some((status) => status === "CANCELED" || status === "ANNULED")) return "DECLINED" as const;
  if (statuses.some((status) => status === "SIGNING_EXPIRED" || status === "DELETED")) return "EXPIRED" as const;
  return "WAITING" as const;
}

function pdfPath(packageId: string, kind: "contract" | "consent") {
  return path.join(process.env.FDOC_SIGNED_FILES_DIR ?? path.join(process.cwd(), ".local", "fdoc-signed"), packageId, `${kind}.pdf`);
}

export async function syncTrialSigning(user: CurrentUser, trialId: string) {
  const prisma = getPrisma();
  const signing = await prisma.trialSigningPackage.findFirstOrThrow({
    where: { trialId, schoolId: user.schoolId },
    include: { trial: { include: { coach: { select: { userId: true } } } } }
  });
  assertAccess(user, signing.trial.coach.userId);
  return syncSigningRecord(signing, user.id);
}

export async function syncTrialSigningByPackageId(packageId: string) {
  const signing = await getPrisma().trialSigningPackage.findUnique({ where: { id: packageId } });
  if (!signing) return null;
  return syncSigningRecord(signing, null);
}

async function syncSigningRecord(signing: {
  id: string; schoolId: string; contractDocumentId: string | null; consentDocumentId: string | null;
  status: string; signedAt: Date | null;
}, actorUserId: string | null) {
  const prisma = getPrisma();
  if (!signing.contractDocumentId || !signing.consentDocumentId) {
    throw new Error("F.Doc пока не вернул номера документов. Проверьте отправку.");
  }
  const [contractStatus, consentStatus] = await Promise.all([
    fdocStatus(signing.contractDocumentId, "document"),
    fdocStatus(signing.consentDocumentId, "document")
  ]);
  const status = overallStatus([contractStatus, consentStatus]);
  if (contractStatus === "SIGNED") await saveSignedPdf(signing.id, signing.contractDocumentId, "contract");
  if (consentStatus === "SIGNED") await saveSignedPdf(signing.id, signing.consentDocumentId, "consent");
  const updated = await prisma.trialSigningPackage.update({
    where: { id: signing.id },
    data: { status, contractStatus, consentStatus, checkedAt: new Date(), signedAt: status === "SIGNED" ? (signing.signedAt ?? new Date()) : null }
  });
  if (status === "SIGNED" && signing.status !== "SIGNED") {
    await writeAuditLog({ schoolId: signing.schoolId, actorUserId, action: "TRIAL_SIGNING_COMPLETED", entityType: "TrialSigningPackage", entityId: signing.id });
  }
  return updated;
}

async function saveSignedPdf(packageId: string, documentId: string, kind: "contract" | "consent") {
  const filePath = pdfPath(packageId, kind);
  try { await readFile(filePath); return; } catch { /* Download once. */ }
  const pdf = await fdocSignedPdf(packageId, documentId);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, pdf, { mode: 0o600 });
}

export async function getSignedTrialDocument(user: CurrentUser, trialId: string, kind: "contract" | "consent") {
  const signing = await getPrisma().trialSigningPackage.findFirstOrThrow({
    where: { trialId, schoolId: user.schoolId },
    include: { trial: { include: { coach: { select: { userId: true } } } } }
  });
  assertAccess(user, signing.trial.coach.userId);
  if (kind === "contract" ? signing.contractStatus !== "SIGNED" : signing.consentStatus !== "SIGNED") {
    throw new Error("Документ ещё не подписан.");
  }
  return readFile(pdfPath(signing.id, kind));
}
