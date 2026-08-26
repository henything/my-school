import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { getPrisma } from "@/server/db/prisma";
import {
  buildChildNameBirthDateKey,
  buildExcelImportDraft,
  readStoredExcelImportPayload,
  type ExcelImportIssue,
  type ExcelImportPayload,
  type ExcelImportPreview
} from "./excel-validation";

type ImportBatchRecord = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  preview: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy?: {
    id: string;
    displayName: string;
    login: string;
  } | null;
  errors?: ImportIssueRecord[];
  _count?: {
    errors: number;
  };
};

type ImportIssueRecord = {
  id: string;
  severity: string;
  sheetName: string;
  rowNumber: number | null;
  fieldName: string | null;
  errorMessage: string;
  rawRow: Prisma.JsonValue | null;
  createdAt: Date;
};

export type ConfirmExcelImportResult = {
  batch: ReturnType<typeof serializeExcelImportBatch>;
  oneTimePasswords: Array<{
    coachCode: string;
    login: string;
    temporaryPassword: string;
  }>;
};

const batchInclude: Prisma.ImportBatchInclude = {
  uploadedBy: { select: { id: true, displayName: true, login: true } },
  errors: {
    orderBy: [{ severity: "asc" }, { sheetName: "asc" }, { rowNumber: "asc" }, { createdAt: "asc" }],
    take: 200
  },
  _count: { select: { errors: true } }
};

export async function validateExcelImportFile(currentUser: CurrentUser, input: { buffer: Buffer; fileName: string }) {
  assertSuperAdmin(currentUser);
  assertXlsxFile(input.fileName);

  const prisma = getPrisma();
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const batch = await prisma.importBatch.create({
    data: {
      schoolId: currentUser.schoolId,
      uploadedByUserId: currentUser.id,
      fileName: input.fileName,
      fileHash,
      status: "VALIDATING"
    }
  });

  try {
    const validationContext = await buildValidationContext(currentUser.schoolId);
    const draft = await buildExcelImportDraft(input.buffer, validationContext);
    const errorCount = draft.issues.filter((issue) => issue.severity === "ERROR").length;
    const status = errorCount > 0 ? "VALIDATION_FAILED" : "READY_TO_IMPORT";

    const updatedBatch = await prisma.$transaction(async (tx) => {
      if (draft.issues.length > 0) {
        await tx.importError.createMany({
          data: draft.issues.map((issue) => issueToCreateInput(batch.id, issue))
        });
      }

      const savedBatch = await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status,
          totalRows: draft.totalRows,
          successRows: Math.max(draft.totalRows - draft.failedRows, 0),
          failedRows: draft.failedRows,
          preview: draft.preview as Prisma.InputJsonValue,
          parsedPayload: errorCount === 0 ? (draft.payload as Prisma.InputJsonValue) : undefined
        },
        include: batchInclude
      });

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: errorCount > 0 ? "EXCEL_IMPORT_VALIDATION_FAILED" : "EXCEL_IMPORT_READY",
          entityType: "ImportBatch",
          entityId: batch.id,
          newValue: {
            fileName: input.fileName,
            totalRows: draft.totalRows,
            errorCount,
            warningCount: draft.issues.filter((issue) => issue.severity === "WARNING").length
          }
        },
        tx
      );

      return savedBatch;
    });

    return serializeExcelImportBatch(updatedBatch);
  } catch (error) {
    await prisma
      .$transaction(async (tx) => {
        await tx.importError.create({
          data: {
            importBatchId: batch.id,
            severity: "ERROR",
            sheetName: "Workbook",
            rowNumber: null,
            fieldName: null,
            errorMessage: error instanceof Error ? error.message : "Не удалось прочитать Excel-файл."
          }
        });

        const failedBatch = await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "FAILED",
            result: {
              error: error instanceof Error ? error.message : "Не удалось прочитать Excel-файл."
            }
          },
          include: batchInclude
        });

        await writeAuditLog(
          {
            schoolId: currentUser.schoolId,
            actorUserId: currentUser.id,
            action: "EXCEL_IMPORT_FAILED",
            entityType: "ImportBatch",
            entityId: batch.id,
            newValue: {
              fileName: input.fileName,
              error: error instanceof Error ? error.message : "Не удалось прочитать Excel-файл."
            }
          },
          tx
        );

        return failedBatch;
      })
      .catch(() => undefined);

    throw error;
  }
}

export async function confirmExcelImport(currentUser: CurrentUser, batchId: string): Promise<ConfirmExcelImportResult> {
  assertSuperAdmin(currentUser);

  const prisma = getPrisma();
  const batch = await prisma.importBatch.findFirst({
    where: {
      id: batchId,
      schoolId: currentUser.schoolId
    },
    include: {
      errors: {
        where: { severity: "ERROR" },
        take: 1
      }
    }
  });

  if (!batch) {
    throw new Error("ImportBatch не найден.");
  }

  if (batch.status === "IMPORTED") {
    throw new Error("Этот ImportBatch уже импортирован.");
  }

  if (batch.status !== "READY_TO_IMPORT") {
    throw new Error("ImportBatch не готов к подтверждению. Сначала исправьте ошибки и повторите валидацию.");
  }

  if (batch.errors.length > 0) {
    throw new Error("Импорт заблокирован критичными ошибками.");
  }

  const payload = readStoredExcelImportPayload(batch.parsedPayload);
  const { passwordHashes, oneTimePasswords } = await prepareCoachPasswords(payload);

  try {
    const confirmedBatch = await prisma.$transaction(async (tx) => {
      const claim = await tx.importBatch.updateMany({
        where: {
          id: batch.id,
          status: "READY_TO_IMPORT"
        },
        data: {
          status: "VALIDATING"
        }
      });

      if (claim.count !== 1) {
        throw new Error("ImportBatch уже обрабатывается или был изменён.");
      }

      const result = await createImportedRecords(tx, currentUser, payload, passwordHashes);

      await writeAuditLog(
        {
          schoolId: currentUser.schoolId,
          actorUserId: currentUser.id,
          action: "EXCEL_IMPORT_COMPLETED",
          entityType: "ImportBatch",
          entityId: batch.id,
          newValue: result.counts
        },
        tx
      );

      return tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "IMPORTED",
          successRows: batch.totalRows,
          failedRows: 0,
          parsedPayload: Prisma.DbNull,
          result: result as Prisma.InputJsonValue
        },
        include: batchInclude
      });
    });

    return {
      batch: serializeExcelImportBatch(confirmedBatch),
      oneTimePasswords
    };
  } catch (error) {
    await prisma
      .$transaction(async (tx) => {
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "FAILED",
            result: {
              error: error instanceof Error ? error.message : "Не удалось подтвердить импорт."
            }
          }
        });

        await writeAuditLog(
          {
            schoolId: currentUser.schoolId,
            actorUserId: currentUser.id,
            action: "EXCEL_IMPORT_FAILED",
            entityType: "ImportBatch",
            entityId: batch.id,
            newValue: {
              error: error instanceof Error ? error.message : "Не удалось подтвердить импорт."
            }
          },
          tx
        );
      })
      .catch(() => undefined);

    throw error;
  }
}

export async function listExcelImportBatches(currentUser: CurrentUser) {
  assertSuperAdmin(currentUser);

  const batches = await getPrisma().importBatch.findMany({
    where: { schoolId: currentUser.schoolId },
    include: {
      uploadedBy: { select: { id: true, displayName: true, login: true } },
      _count: { select: { errors: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return batches.map(serializeExcelImportBatch);
}

export async function getExcelImportBatch(currentUser: CurrentUser, batchId: string) {
  assertSuperAdmin(currentUser);

  const batch = await getPrisma().importBatch.findFirst({
    where: {
      id: batchId,
      schoolId: currentUser.schoolId
    },
    include: batchInclude
  });

  if (!batch) {
    throw new Error("ImportBatch не найден.");
  }

  return serializeExcelImportBatch(batch);
}

export async function listExcelImportErrors(currentUser: CurrentUser, batchId: string) {
  assertSuperAdmin(currentUser);

  const batch = await getPrisma().importBatch.findFirst({
    where: {
      id: batchId,
      schoolId: currentUser.schoolId
    },
    select: { id: true }
  });

  if (!batch) {
    throw new Error("ImportBatch не найден.");
  }

  const errors = await getPrisma().importError.findMany({
    where: { importBatchId: batch.id },
    orderBy: [{ severity: "asc" }, { sheetName: "asc" }, { rowNumber: "asc" }, { createdAt: "asc" }]
  });

  return errors.map(serializeImportIssue);
}

export function serializeExcelImportBatch(batch: ImportBatchRecord) {
  return {
    id: batch.id,
    fileName: batch.fileName,
    status: batch.status,
    totalRows: batch.totalRows,
    successRows: batch.successRows,
    failedRows: batch.failedRows,
    preview: batch.preview as ExcelImportPreview | null,
    result: batch.result,
    errorsCount: batch._count?.errors ?? batch.errors?.length ?? 0,
    uploadedBy: batch.uploadedBy
      ? {
          id: batch.uploadedBy.id,
          displayName: batch.uploadedBy.displayName,
          login: batch.uploadedBy.login
        }
      : null,
    errors: batch.errors?.map(serializeImportIssue) ?? [],
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString()
  };
}

function serializeImportIssue(issue: ImportIssueRecord) {
  return {
    id: issue.id,
    severity: issue.severity,
    sheetName: issue.sheetName,
    rowNumber: issue.rowNumber,
    fieldName: issue.fieldName,
    errorMessage: issue.errorMessage,
    rawRow: issue.rawRow,
    createdAt: issue.createdAt.toISOString()
  };
}

async function buildValidationContext(schoolId: string) {
  const prisma = getPrisma();
  const [branches, users, parents, children] = await Promise.all([
    prisma.branch.findMany({
      where: { schoolId },
      select: { name: true }
    }),
    prisma.user.findMany({
      where: { schoolId },
      select: { login: true }
    }),
    prisma.parent.findMany({
      where: {
        schoolId,
        phone: { not: null }
      },
      select: { phone: true }
    }),
    prisma.child.findMany({
      where: { schoolId },
      select: { fullName: true, birthDate: true }
    })
  ]);

  return {
    existingBranchNames: branches.map((branch) => branch.name),
    existingCoachLogins: users.map((user) => user.login),
    existingParentPhones: parents.flatMap((parent) => (parent.phone ? [parent.phone] : [])),
    existingChildNameBirthDateKeys: children.flatMap((child) => {
      const key = buildChildNameBirthDateKey(child.fullName, child.birthDate);
      return key ? [key] : [];
    })
  };
}

function issueToCreateInput(importBatchId: string, issue: ExcelImportIssue) {
  return {
    importBatchId,
    severity: issue.severity,
    sheetName: issue.sheetName,
    rowNumber: issue.rowNumber,
    fieldName: issue.fieldName,
    errorMessage: issue.errorMessage,
    rawRow: issue.rawRow ? (issue.rawRow as Prisma.InputJsonValue) : undefined
  };
}

async function prepareCoachPasswords(payload: ExcelImportPayload) {
  const passwordHashes = new Map<string, string>();
  const oneTimePasswords: ConfirmExcelImportResult["oneTimePasswords"] = [];

  for (const coach of payload.coaches) {
    if (coach.passwordHash) {
      passwordHashes.set(coach.code, coach.passwordHash);
      continue;
    }

    const temporaryPassword = generateTemporaryPassword();
    oneTimePasswords.push({
      coachCode: coach.code,
      login: coach.login,
      temporaryPassword
    });
    passwordHashes.set(coach.code, await hashPassword(temporaryPassword));
  }

  return {
    passwordHashes,
    oneTimePasswords
  };
}

async function createImportedRecords(
  tx: Prisma.TransactionClient,
  currentUser: CurrentUser,
  payload: ExcelImportPayload,
  passwordHashes: Map<string, string>
) {
  const branchIdsByCode = new Map<string, string>();
  const coachIdsByCode = new Map<string, string>();
  const groupIdsByCode = new Map<string, string>();
  const groupMetaByCode = new Map<string, { branchId: string; coachId: string }>();
  const parentIdsByCode = new Map<string, string>();
  const createdIds = {
    branches: [] as string[],
    coaches: [] as string[],
    users: [] as string[],
    groups: [] as string[],
    parents: [] as string[],
    children: [] as string[],
    scheduleTemplates: [] as string[],
    lessons: [] as string[]
  };

  for (const branch of payload.branches) {
    const created = await tx.branch.create({
      data: {
        schoolId: currentUser.schoolId,
        name: branch.name,
        address: branch.address,
        status: branch.status,
        inventoryNotes: branch.inventoryNotes,
        comment: branch.comment
      },
      select: { id: true }
    });

    branchIdsByCode.set(branch.code, created.id);
    createdIds.branches.push(created.id);
  }

  for (const coach of payload.coaches) {
    const user = await tx.user.create({
      data: {
        schoolId: currentUser.schoolId,
        login: coach.login,
        passwordHash: requiredMapValue(passwordHashes, coach.code, "passwordHash"),
        role: "COACH",
        status: coach.status,
        displayName: coach.fullName
      },
      select: { id: true }
    });
    const coachProfile = await tx.coachProfile.create({
      data: {
        schoolId: currentUser.schoolId,
        userId: user.id,
        phone: coach.phone,
        notes: coach.comment
      },
      select: { id: true }
    });

    coachIdsByCode.set(coach.code, coachProfile.id);
    createdIds.users.push(user.id);
    createdIds.coaches.push(coachProfile.id);
  }

  for (const group of payload.groups) {
    const branchId = requiredMapValue(branchIdsByCode, group.branchCode, "branch");
    const mainCoachId = requiredMapValue(coachIdsByCode, group.mainCoachCode, "coach");
    const created = await tx.trainingGroup.create({
      data: {
        schoolId: currentUser.schoolId,
        branchId,
        mainCoachId,
        name: group.name,
        status: group.status,
        capacityLimit: group.capacityLimit,
        comment: group.comment
      },
      select: { id: true }
    });

    groupIdsByCode.set(group.code, created.id);
    groupMetaByCode.set(group.code, { branchId, coachId: mainCoachId });
    createdIds.groups.push(created.id);
  }

  for (const parent of payload.parents) {
    const created = await tx.parent.create({
      data: {
        schoolId: currentUser.schoolId,
        fullName: parent.fullName,
        phone: parent.phone,
        vkProfileUrl: parent.vkProfileUrl,
        comment: parent.comment
      },
      select: { id: true }
    });

    parentIdsByCode.set(parent.code, created.id);
    createdIds.parents.push(created.id);
  }

  for (const child of payload.children) {
    const created = await tx.child.create({
      data: {
        schoolId: currentUser.schoolId,
        parentId: child.parentCode ? requiredMapValue(parentIdsByCode, child.parentCode, "parent") : null,
        currentGroupId: requiredMapValue(groupIdsByCode, child.groupCode, "group"),
        fullName: child.fullName,
        birthDate: child.birthDate ? dateFromKey(child.birthDate) : null,
        status: child.status,
        medicalNotes: child.medicalNotes,
        coachComment: child.coachComment,
        adminComment: child.adminComment,
        admissionStatus: "ADMITTED"
      },
      select: { id: true }
    });

    createdIds.children.push(created.id);
  }

  for (const schedule of payload.schedule) {
    const groupMeta = requiredMapValue(groupMetaByCode, schedule.groupCode, "groupMeta");
    const created = await tx.scheduleTemplate.create({
      data: {
        schoolId: currentUser.schoolId,
        groupId: requiredMapValue(groupIdsByCode, schedule.groupCode, "group"),
        branchId: schedule.branchCode ? requiredMapValue(branchIdsByCode, schedule.branchCode, "branch") : groupMeta.branchId,
        coachId: schedule.coachCode ? requiredMapValue(coachIdsByCode, schedule.coachCode, "coach") : groupMeta.coachId,
        weekday: schedule.weekday,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: schedule.status
      },
      select: { id: true }
    });

    createdIds.scheduleTemplates.push(created.id);
  }

  for (const lesson of payload.lessons) {
    const groupMeta = requiredMapValue(groupMetaByCode, lesson.groupCode, "groupMeta");
    const created = await tx.lesson.create({
      data: {
        schoolId: currentUser.schoolId,
        groupId: requiredMapValue(groupIdsByCode, lesson.groupCode, "group"),
        branchId: lesson.branchCode ? requiredMapValue(branchIdsByCode, lesson.branchCode, "branch") : groupMeta.branchId,
        coachId: lesson.coachCode ? requiredMapValue(coachIdsByCode, lesson.coachCode, "coach") : groupMeta.coachId,
        lessonDate: dateFromKey(lesson.lessonDate),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        status: lesson.status,
        changeComment: lesson.comment
      },
      select: { id: true }
    });

    createdIds.lessons.push(created.id);
  }

  return {
    counts: {
      branchesCreated: createdIds.branches.length,
      coachUsersCreated: createdIds.users.length,
      coachProfilesCreated: createdIds.coaches.length,
      groupsCreated: createdIds.groups.length,
      parentsCreated: createdIds.parents.length,
      childrenCreated: createdIds.children.length,
      scheduleTemplatesCreated: createdIds.scheduleTemplates.length,
      lessonsCreated: createdIds.lessons.length
    },
    createdIds
  };
}

function requiredMapValue<T>(map: Map<string, T>, key: string, label: string) {
  const value = map.get(key);

  if (!value) {
    throw new Error(`Не найден mapping ${label} для кода ${key}. Повторите валидацию файла.`);
  }

  return value;
}

function dateFromKey(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function generateTemporaryPassword() {
  return `Ms-${randomBytes(9).toString("base64url")}`;
}

function assertXlsxFile(fileName: string) {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Загрузите файл в формате .xlsx.");
  }
}

function assertSuperAdmin(currentUser: CurrentUser) {
  if (currentUser.role !== "SUPER_ADMIN") {
    throw new Error("Excel Import доступен только SUPER_ADMIN.");
  }
}
