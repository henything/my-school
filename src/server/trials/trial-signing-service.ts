import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { writeAuditLog } from "@/server/audit/audit-service";
import { assertFdocConfigured, fdocSignedPdf, fdocStatus, sendFdocPackage } from "./fdoc-client";
import { reservationDeadline } from "./test-journey-rules";

function assertAccess(user: CurrentUser, coachUserId: string, parentUserId?: string | null) {
  if (!hasRole(user, ADMIN_ROLES) && !(user.role === "COACH" && user.id === coachUserId) && !(user.role === "PARENT" && user.id === parentUserId)) {
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
    include: { coach: { select: { userId: true } }, group: { select: { name: true } }, convertedChild: { select: { birthDate: true, parent: { select: { account: { select: { userId: true } } } } } } }
  });
  assertAccess(user, trial.coach.userId, trial.convertedChild?.parent?.account?.userId);
  const testJourney = await prisma.trialTestJourney.findUnique({ where: { trialId } });
  if (testJourney && (trial.status !== "WANTS_TO_CONTINUE" || !testJourney.scheduleChosenAt)) {
    throw new Error("Тренер должен подтвердить продолжение, а родитель — выбрать график.");
  }
  if ((!testJourney && trial.status !== "TRIAL_ATTENDED") || trial.trialAttended !== true) {
    throw new Error("Сначала отметьте, что ребёнок посетил пробное занятие.");
  }
  if (!trial.childName || !trial.parentName || !trial.parentPhone) {
    throw new Error("Для отправки нужны имя ребёнка, ФИО и телефон родителя.");
  }
  assertFdocConfigured();
  const parentPhone = normalizePhone(trial.parentPhone);

  if (testJourney?.reserveExpiresAt && testJourney.reserveExpiresAt < new Date()) {
    throw new Error("Срок резерва места истёк. Администратор должен проверить доступность группы.");
  }
  if (testJourney && !testJourney.reserveExpiresAt) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "groups" WHERE "id" = ${trial.groupId}::uuid FOR UPDATE`;
      const group = await tx.trainingGroup.findUniqueOrThrow({
        where: { id: trial.groupId },
        select: { capacityLimit: true, children: { where: { status: "ACTIVE" }, select: { id: true } } }
      });
      const reserves = await tx.trialTestJourney.count({
        where: {
          id: { not: testJourney.id },
          reserveExpiresAt: { gt: new Date() },
          paidAt: null,
          trial: { groupId: trial.groupId }
        }
      });
      if (group.children.length + reserves >= group.capacityLimit) {
        throw new Error("В группе больше нет свободного места для резерва.");
      }
      await tx.trialTestJourney.update({
        where: { id: testJourney.id },
        data: { reserveExpiresAt: reservationDeadline(new Date()) }
      });
    });
  }

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
      parentPhone,
      childBirth: (testJourney?.childBirthDate ?? trial.convertedChild?.birthDate)?.toLocaleDateString("ru-RU", { timeZone: "UTC" }),
      groupName: trial.group.name
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
    include: {
      trial: {
        include: {
          coach: { select: { userId: true } },
          convertedChild: { select: { parent: { select: { account: { select: { userId: true } } } } } }
        }
      }
    }
  });
  assertAccess(user, signing.trial.coach.userId, signing.trial.convertedChild?.parent?.account?.userId);
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
  if (!hasRole(user, ADMIN_ROLES)) throw new Error("Подписанные документы доступны только администратору.");
  const signing = await getPrisma().trialSigningPackage.findFirstOrThrow({
    where: { trialId, schoolId: user.schoolId },
    include: { trial: { include: { coach: { select: { userId: true } } } } }
  });
  if (kind === "contract" ? signing.contractStatus !== "SIGNED" : signing.consentStatus !== "SIGNED") {
    throw new Error("Документ ещё не подписан.");
  }
  return readFile(pdfPath(signing.id, kind));
}
