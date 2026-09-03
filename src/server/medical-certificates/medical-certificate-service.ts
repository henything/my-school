import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { finalizeAttendanceInTransaction } from "@/server/makeups/makeup-service";
import { getActiveParentAccount } from "@/server/parents/parent-auth-service";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import type { CreateMedicalCertificateInput, ReviewMedicalCertificateInput } from "./schemas";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const certificateInclude = {
  child: { select: { id: true, fullName: true, currentGroup: { select: { id: true, name: true } } } },
  attendanceRecord: {
    select: {
      id: true,
      status: true,
      finalStatus: true,
      lesson: { select: { id: true, lessonDate: true, startTime: true, endTime: true, group: { select: { id: true, name: true } } } }
    }
  },
  uploadedBy: { select: { id: true, displayName: true, role: true } },
  reviewedBy: { select: { id: true, displayName: true, role: true } }
} as const;

type CertificateRecord = Prisma.MedicalCertificateGetPayload<{ include: typeof certificateInclude }>;

export function serializeMedicalCertificate(certificate: CertificateRecord) {
  return {
    id: certificate.id,
    childId: certificate.childId,
    child: certificate.child,
    status: certificate.status,
    periodStart: dateToKey(certificate.periodStart),
    periodEnd: dateToKey(certificate.periodEnd),
    originalFileName: certificate.originalFileName,
    mimeType: certificate.mimeType,
    fileSizeBytes: certificate.fileSizeBytes,
    comment: certificate.comment,
    adminComment: certificate.adminComment,
    uploadedBy: certificate.uploadedBy,
    reviewedBy: certificate.reviewedBy,
    reviewedAt: certificate.reviewedAt?.toISOString() ?? null,
    createdAt: certificate.createdAt.toISOString(),
    attendanceRecord: certificate.attendanceRecord
      ? {
          id: certificate.attendanceRecord.id,
          status: certificate.attendanceRecord.status,
          finalStatus: certificate.attendanceRecord.finalStatus,
          lesson: {
            id: certificate.attendanceRecord.lesson.id,
            lessonDate: dateToKey(certificate.attendanceRecord.lesson.lessonDate),
            startTime: certificate.attendanceRecord.lesson.startTime,
            endTime: certificate.attendanceRecord.lesson.endTime,
            group: certificate.attendanceRecord.lesson.group
          }
        }
      : null
  };
}

export async function listMedicalCertificates(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const certificates = await getPrisma().medicalCertificate.findMany({
    where: { schoolId: currentUser.schoolId },
    include: certificateInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return certificates.map(serializeMedicalCertificate);
}

export async function createMedicalCertificate(currentUser: CurrentUser, input: CreateMedicalCertificateInput, file: File) {
  await assertCanUploadForChild(currentUser, input.childId);
  validateFile(file);

  const storageKey = buildStorageKey(file);
  const uploadPath = certificatePath(storageKey);
  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

  try {
    const certificate = await getPrisma().$transaction(async (tx) => {
      const attendanceRecord = input.attendanceRecordId
        ? await tx.attendanceRecord.findFirstOrThrow({
            where: {
              id: input.attendanceRecordId,
              childId: input.childId,
              lesson: { schoolId: currentUser.schoolId }
            },
            select: { id: true, status: true, finalStatus: true }
          })
        : null;

      if (attendanceRecord && (attendanceRecord.status !== "ABSENT_SICK_PENDING" || attendanceRecord.finalStatus)) {
        throw new Error("Справку можно привязать только к болезни, которая ждёт финального решения.");
      }

      const created = await tx.medicalCertificate.create({
        data: {
          schoolId: currentUser.schoolId,
          childId: input.childId,
          attendanceRecordId: input.attendanceRecordId ?? null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          originalFileName: normalizeFileName(file.name),
          storageKey,
          mimeType: file.type,
          fileSizeBytes: file.size,
          comment: input.comment ?? null,
          uploadedByUserId: currentUser.id
        },
        include: certificateInclude
      });

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "MEDICAL_CERTIFICATE_UPLOADED",
          entityType: "MedicalCertificate",
          entityId: created.id,
          newValue: {
            childId: created.childId,
            attendanceRecordId: created.attendanceRecordId,
            periodStart: dateToKey(created.periodStart),
            periodEnd: dateToKey(created.periodEnd),
            fileName: created.originalFileName
          },
          comment: input.comment
        },
        tx
      );

      return created;
    });

    return serializeMedicalCertificate(certificate);
  } catch (error) {
    await unlink(uploadPath).catch(() => undefined);
    throw error;
  }
}

export async function reviewMedicalCertificate(currentUser: CurrentUser, certificateId: string, input: ReviewMedicalCertificateInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.medicalCertificate.findFirstOrThrow({
      where: { id: certificateId, schoolId: currentUser.schoolId },
      include: certificateInclude
    });

    if (existing.status !== "PENDING") {
      throw new Error("По этой справке решение уже принято.");
    }

    const updated = await tx.medicalCertificate.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        adminComment: input.adminComment ?? null,
        reviewedByUserId: currentUser.id,
        reviewedAt: new Date()
      },
      include: certificateInclude
    });

    let finalizedAttendance = null;
    if (input.status === "APPROVED" && existing.attendanceRecordId) {
      finalizedAttendance = await finalizeAttendanceInTransaction(tx, currentUser, existing.attendanceRecordId, {
        finalStatus: "ABSENT_SICK_CONFIRMED",
        comment: input.adminComment ?? "Справка одобрена"
      });
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: input.status === "APPROVED" ? "MEDICAL_CERTIFICATE_APPROVED" : "MEDICAL_CERTIFICATE_REJECTED",
        entityType: "MedicalCertificate",
        entityId: existing.id,
        oldValue: { status: existing.status, adminComment: existing.adminComment },
        newValue: {
          status: updated.status,
          adminComment: updated.adminComment,
          finalizedAttendanceRecordId: finalizedAttendance?.attendanceRecord.id ?? null,
          makeupCreditId: finalizedAttendance?.makeup?.id ?? null
        },
        comment: input.adminComment
      },
      tx
    );

    return {
      certificate: serializeMedicalCertificate(updated),
      finalizedAttendance
    };
  });
}

export async function loadMedicalCertificateFile(currentUser: CurrentUser, certificateId: string) {
  const certificate = await getPrisma().medicalCertificate.findFirstOrThrow({
    where: { id: certificateId, schoolId: currentUser.schoolId },
    include: certificateInclude
  });

  if (!hasRole(currentUser, ADMIN_ROLES)) {
    await assertCanUploadForChild(currentUser, certificate.childId);
  }

  const file = await readFile(certificatePath(certificate.storageKey));
  return {
    buffer: file,
    mimeType: certificate.mimeType,
    fileName: certificate.originalFileName
  };
}

export async function listMedicalCertificatesForChild(currentUser: CurrentUser, childId: string) {
  await assertCanUploadForChild(currentUser, childId);

  const certificates = await getPrisma().medicalCertificate.findMany({
    where: { schoolId: currentUser.schoolId, childId },
    include: certificateInclude,
    orderBy: { createdAt: "desc" }
  });

  return certificates.map(serializeMedicalCertificate);
}

async function assertCanUploadForChild(currentUser: CurrentUser, childId: string) {
  if (hasRole(currentUser, ADMIN_ROLES)) {
    await getPrisma().child.findFirstOrThrow({
      where: { id: childId, schoolId: currentUser.schoolId, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
    return;
  }

  if (currentUser.role !== "PARENT") {
    throw new Error("Недостаточно прав.");
  }

  const account = await getActiveParentAccount(currentUser);
  await getPrisma().child.findFirstOrThrow({
    where: { id: childId, schoolId: currentUser.schoolId, parentId: account.parentId, status: { not: "ARCHIVED" } },
    select: { id: true }
  });
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Недостаточно прав.");
  }
}

function validateFile(file: File) {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Прикрепите файл справки.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Файл справки должен быть не больше 10 МБ.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Можно загрузить PDF, JPG, PNG или WEBP.");
  }
}

function buildStorageKey(file: File) {
  const extension = ALLOWED_MIME_TYPES.get(file.type) ?? "bin";
  return `${randomUUID()}.${extension}`;
}

function certificatePath(storageKey: string) {
  return path.join(process.env.MEDICAL_CERTIFICATE_UPLOAD_DIR ?? path.join(process.cwd(), ".local", "medical-certificates"), storageKey);
}

function normalizeFileName(fileName: string) {
  const name = path.basename(fileName).trim();
  return name.length > 0 ? name.slice(0, 180) : "certificate";
}
