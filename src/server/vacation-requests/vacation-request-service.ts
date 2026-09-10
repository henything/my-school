import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { createVacationInTransaction } from "@/server/makeups/makeup-service";
import { assertVacationIsNotBackdated } from "@/server/makeups/rules";
import { getActiveParentAccount } from "@/server/parents/parent-auth-service";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import type { CreateVacationRequestInput, ReviewVacationRequestInput } from "./schemas";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const vacationRequestInclude = {
  child: { select: { id: true, fullName: true, currentGroup: { select: { id: true, name: true } } } },
  uploadedBy: { select: { id: true, displayName: true, role: true } },
  reviewedBy: { select: { id: true, displayName: true, role: true } }
} as const;

type VacationRequestRecord = Prisma.VacationRequestGetPayload<{ include: typeof vacationRequestInclude }>;

export function serializeVacationRequest(request: VacationRequestRecord) {
  return {
    id: request.id,
    childId: request.childId,
    child: request.child,
    status: request.status,
    periodStart: dateToKey(request.periodStart),
    periodEnd: dateToKey(request.periodEnd),
    originalFileName: request.originalFileName,
    mimeType: request.mimeType,
    fileSizeBytes: request.fileSizeBytes,
    comment: request.comment,
    adminComment: request.adminComment,
    lessonCount: request.lessonCount,
    makeupCount: request.makeupCount,
    uploadedBy: request.uploadedBy,
    reviewedBy: request.reviewedBy,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString()
  };
}

export async function listVacationRequests(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const requests = await getPrisma().vacationRequest.findMany({
    where: { schoolId: currentUser.schoolId },
    include: vacationRequestInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return requests.map(serializeVacationRequest);
}

export async function createVacationRequest(currentUser: CurrentUser, input: CreateVacationRequestInput, file: File) {
  await assertCanUploadForChild(currentUser, input.childId);
  assertVacationIsNotBackdated(input.periodStart, new Date());
  validateFile(file);

  const storageKey = buildStorageKey(file);
  const uploadPath = vacationRequestPath(storageKey);
  await mkdir(path.dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

  try {
    const request = await getPrisma().$transaction(async (tx) => {
      const created = await tx.vacationRequest.create({
        data: {
          schoolId: currentUser.schoolId,
          childId: input.childId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          originalFileName: normalizeFileName(file.name),
          storageKey,
          mimeType: file.type,
          fileSizeBytes: file.size,
          comment: input.comment ?? null,
          uploadedByUserId: currentUser.id
        },
        include: vacationRequestInclude
      });

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "VACATION_REQUEST_UPLOADED",
          entityType: "VacationRequest",
          entityId: created.id,
          newValue: {
            childId: created.childId,
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

    return serializeVacationRequest(request);
  } catch (error) {
    await unlink(uploadPath).catch(() => undefined);
    throw error;
  }
}

export async function reviewVacationRequest(currentUser: CurrentUser, requestId: string, input: ReviewVacationRequestInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.vacationRequest.findFirstOrThrow({
      where: { id: requestId, schoolId: currentUser.schoolId },
      include: vacationRequestInclude
    });

    if (existing.status !== "PENDING") {
      throw new Error("По этому заявлению решение уже принято.");
    }

    let vacationResult: Awaited<ReturnType<typeof createVacationInTransaction>> | null = null;
    if (input.status === "APPROVED") {
      vacationResult = await createVacationInTransaction(tx, currentUser, existing.childId, {
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        comment: input.adminComment ?? existing.comment
      });
    }

    const updated = await tx.vacationRequest.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        adminComment: input.adminComment ?? null,
        lessonCount: vacationResult?.lessonCount ?? null,
        makeupCount: vacationResult?.makeupCount ?? null,
        reviewedByUserId: currentUser.id,
        reviewedAt: new Date()
      },
      include: vacationRequestInclude
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: input.status === "APPROVED" ? "VACATION_REQUEST_APPROVED" : "VACATION_REQUEST_REJECTED",
        entityType: "VacationRequest",
        entityId: existing.id,
        oldValue: { status: existing.status, adminComment: existing.adminComment },
        newValue: {
          status: updated.status,
          adminComment: updated.adminComment,
          lessonCount: updated.lessonCount,
          makeupCount: updated.makeupCount
        },
        comment: input.adminComment
      },
      tx
    );

    return {
      request: serializeVacationRequest(updated),
      vacation: vacationResult
    };
  });
}

export async function loadVacationRequestFile(currentUser: CurrentUser, requestId: string) {
  const request = await getPrisma().vacationRequest.findFirstOrThrow({
    where: { id: requestId, schoolId: currentUser.schoolId },
    include: vacationRequestInclude
  });

  if (!hasRole(currentUser, ADMIN_ROLES)) {
    await assertCanUploadForChild(currentUser, request.childId);
  }

  const file = await readFile(vacationRequestPath(request.storageKey));
  return {
    buffer: file,
    mimeType: request.mimeType,
    fileName: request.originalFileName
  };
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
    throw new Error("Прикрепите заявление.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Файл заявления должен быть не больше 10 МБ.");
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Можно загрузить PDF, JPG, PNG или WEBP.");
  }
}

function buildStorageKey(file: File) {
  const extension = ALLOWED_MIME_TYPES.get(file.type) ?? "bin";
  return `${randomUUID()}.${extension}`;
}

function vacationRequestPath(storageKey: string) {
  return path.join(process.env.VACATION_REQUEST_UPLOAD_DIR ?? path.join(process.cwd(), ".local", "vacation-requests"), storageKey);
}

function normalizeFileName(fileName: string) {
  const name = path.basename(fileName).trim();
  return name.length > 0 ? name.slice(0, 180) : "vacation-request";
}
