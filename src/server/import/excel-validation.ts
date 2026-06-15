import ExcelJS from "exceljs";
import { hashPassword } from "@/server/auth/password";

export type ImportIssueSeverity = "ERROR" | "WARNING";

export type ExcelImportIssue = {
  severity: ImportIssueSeverity;
  sheetName: string;
  rowNumber: number | null;
  fieldName: string | null;
  errorMessage: string;
  rawRow?: Record<string, unknown> | null;
};

export type BranchImportRow = {
  sourceRowNumber: number;
  code: string;
  name: string;
  address: string | null;
  inventoryNotes: string | null;
  comment: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type CoachImportRow = {
  sourceRowNumber: number;
  code: string;
  fullName: string;
  login: string;
  passwordHash: string | null;
  hasProvidedTemporaryPassword: boolean;
  phone: string | null;
  comment: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type GroupImportRow = {
  sourceRowNumber: number;
  code: string;
  name: string;
  branchCode: string;
  mainCoachCode: string;
  capacityLimit: number;
  inventoryNotes: string | null;
  comment: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type ParentImportRow = {
  sourceRowNumber: number;
  code: string;
  fullName: string | null;
  phone: string | null;
  vkProfileUrl: string | null;
  comment: string | null;
};

export type ChildImportRow = {
  sourceRowNumber: number;
  code: string;
  fullName: string;
  birthDate: string | null;
  parentCode: string | null;
  groupCode: string;
  medicalNotes: string | null;
  coachComment: string | null;
  adminComment: string | null;
  status: "ACTIVE" | "PAUSED" | "LEFT" | "TRIAL" | "ARCHIVED";
};

export type ScheduleImportRow = {
  sourceRowNumber: number;
  code: string;
  groupCode: string;
  branchCode: string | null;
  coachCode: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

export type LessonImportRow = {
  sourceRowNumber: number;
  code: string;
  groupCode: string;
  branchCode: string | null;
  coachCode: string | null;
  lessonDate: string;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "CANCELLED";
  comment: string | null;
};

export type ExcelImportPayload = {
  branches: BranchImportRow[];
  coaches: CoachImportRow[];
  groups: GroupImportRow[];
  parents: ParentImportRow[];
  children: ChildImportRow[];
  schedule: ScheduleImportRow[];
  lessons: LessonImportRow[];
};

export type ExcelImportPreview = {
  totalRows: number;
  errorCount: number;
  warningCount: number;
  canConfirm: boolean;
  sheets: Record<
    string,
    {
      rows: number;
      errors: number;
      warnings: number;
      imported: boolean;
    }
  >;
};

export type ExcelImportDraft = {
  payload: ExcelImportPayload;
  issues: ExcelImportIssue[];
  preview: ExcelImportPreview;
  totalRows: number;
  failedRows: number;
};

export type ExcelImportValidationContext = {
  existingBranchNames?: string[];
  existingCoachLogins?: string[];
  existingParentPhones?: string[];
  existingChildNameBirthDateKeys?: string[];
  hashPassword?: (password: string) => Promise<string>;
};

type SheetName = keyof typeof SHEETS;
type ParsedSheet = {
  name: SheetName;
  isPresent: boolean;
  headers: string[];
  missingColumns: Set<string>;
  rows: ParsedRow[];
};

type ParsedRow = {
  sheetName: SheetName;
  rowNumber: number;
  values: Record<string, unknown>;
  rawRow: Record<string, unknown>;
};

const ENTITY_STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
const CHILD_STATUSES = ["ACTIVE", "PAUSED", "LEFT", "TRIAL", "ARCHIVED"] as const;
const LESSON_STATUSES = ["SCHEDULED", "CANCELLED"] as const;

const SHEETS = {
  Branches: {
    required: true,
    columns: ["branch_code", "branch_name", "address", "inventory_notes", "comment", "status"],
    requiredColumns: ["branch_code", "branch_name"]
  },
  Coaches: {
    required: true,
    columns: ["coach_code", "full_name", "login", "temporary_password", "phone", "comment", "status"],
    requiredColumns: ["coach_code", "full_name", "login"]
  },
  Groups: {
    required: true,
    columns: ["group_code", "group_name", "branch_code", "main_coach_code", "capacity_limit", "inventory_notes", "comment", "status"],
    requiredColumns: ["group_code", "group_name", "branch_code", "main_coach_code"]
  },
  Parents: {
    required: true,
    columns: ["parent_code", "full_name", "phone", "vk_profile_url", "comment"],
    requiredColumns: ["parent_code"]
  },
  Children: {
    required: true,
    columns: [
      "child_code",
      "full_name",
      "birth_date",
      "parent_code",
      "group_code",
      "medical_notes",
      "coach_comment",
      "admin_comment",
      "status"
    ],
    requiredColumns: ["child_code", "full_name", "group_code"]
  },
  Schedule: {
    required: true,
    columns: ["schedule_code", "group_code", "branch_code", "coach_code", "weekday", "start_time", "end_time", "valid_from", "valid_to", "status"],
    requiredColumns: ["schedule_code", "group_code", "weekday", "start_time"]
  },
  Lessons: {
    required: false,
    columns: ["lesson_code", "group_code", "branch_code", "coach_code", "lesson_date", "start_time", "end_time", "status", "comment"],
    requiredColumns: ["lesson_code", "group_code", "lesson_date", "start_time"]
  },
  AttendanceSource: {
    required: false,
    columns: [],
    requiredColumns: []
  }
} as const;

const IMPORTED_SHEET_NAMES: SheetName[] = ["Branches", "Coaches", "Groups", "Parents", "Children", "Schedule", "Lessons"];
const ALL_SHEET_NAMES = Object.keys(SHEETS) as SheetName[];
const BALANCE_OR_HISTORY_COLUMN_PATTERN = /(balance|остат|makeup|перенос|payment|оплат|attendance|посещ)/i;
const WEEKDAYS: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7
};

export async function buildExcelImportDraft(buffer: Buffer, context: ExcelImportValidationContext = {}): Promise<ExcelImportDraft> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const issues: ExcelImportIssue[] = [];
  const sheets = ALL_SHEET_NAMES.map((sheetName) => readSheet(workbook, sheetName, issues));
  const sheetByName = Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet])) as Record<SheetName, ParsedSheet>;
  const passwordHasher = context.hashPassword ?? hashPassword;

  for (const sheetName of ALL_SHEET_NAMES) {
    addSheetStructureIssues(sheetByName[sheetName], issues);
  }

  const payload: ExcelImportPayload = {
    branches: parseBranches(sheetByName.Branches, issues),
    coaches: await parseCoaches(sheetByName.Coaches, issues, passwordHasher),
    groups: parseGroups(sheetByName.Groups, issues),
    parents: parseParents(sheetByName.Parents, issues),
    children: parseChildren(sheetByName.Children, issues),
    schedule: parseSchedule(sheetByName.Schedule, issues),
    lessons: parseLessons(sheetByName.Lessons, issues)
  };

  addCrossSheetIssues(payload, issues);
  addDuplicateIssues(payload, issues);
  addExistingDataIssues(payload, context, issues);
  addIgnoredAttendanceWarning(sheetByName.AttendanceSource, issues);
  addIgnoredScheduleWindowWarnings(sheetByName.Schedule, issues);

  const totalRows =
    payload.branches.length +
    payload.coaches.length +
    payload.groups.length +
    payload.parents.length +
    payload.children.length +
    payload.schedule.length +
    payload.lessons.length;
  const failedRows = countFailedRows(issues);
  const preview = buildPreview(sheetByName, payload, issues, totalRows);

  return {
    payload,
    issues,
    preview,
    totalRows,
    failedRows
  };
}

export function buildChildNameBirthDateKey(fullName: string, birthDate: Date | string | null) {
  if (!birthDate) {
    return null;
  }

  const dateKey = birthDate instanceof Date ? dateToKey(birthDate) : birthDate;
  return `${normalizeKey(fullName)}|${dateKey}`;
}

export function readStoredExcelImportPayload(value: unknown): ExcelImportPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Данные импорта не найдены. Повторите валидацию файла.");
  }

  const payload = value as Partial<ExcelImportPayload>;
  const hasAllArrays =
    Array.isArray(payload.branches) &&
    Array.isArray(payload.coaches) &&
    Array.isArray(payload.groups) &&
    Array.isArray(payload.parents) &&
    Array.isArray(payload.children) &&
    Array.isArray(payload.schedule) &&
    Array.isArray(payload.lessons);

  if (!hasAllArrays) {
    throw new Error("Данные импорта повреждены. Повторите валидацию файла.");
  }

  return payload as ExcelImportPayload;
}

function readSheet(workbook: ExcelJS.Workbook, sheetName: SheetName, issues: ExcelImportIssue[]): ParsedSheet {
  const worksheet = workbook.getWorksheet(sheetName);
  const definition = SHEETS[sheetName];

  if (!worksheet) {
    if (definition.required) {
      issues.push({
        severity: "ERROR",
        sheetName,
        rowNumber: null,
        fieldName: null,
        errorMessage: `Обязательный лист ${sheetName} отсутствует.`,
        rawRow: null
      });
    }

    return {
      name: sheetName,
      isPresent: false,
      headers: [],
      missingColumns: new Set(),
      rows: []
    };
  }

  const headerByColumn = new Map<number, string>();
  const headers: string[] = [];

  for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex += 1) {
    const header = normalizeHeader(cellValue(worksheet.getRow(1).getCell(columnIndex)));

    if (header) {
      headerByColumn.set(columnIndex, header);
      headers.push(header);
    }
  }

  const missingColumns = new Set(definition.requiredColumns.filter((column) => !headers.includes(column)));
  const rows: ParsedRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: Record<string, unknown> = {};

    for (const [columnIndex, header] of headerByColumn.entries()) {
      values[header] = normalizeCell(cellValue(row.getCell(columnIndex)));
    }

    if (Object.values(values).every((value) => isEmpty(value))) {
      continue;
    }

    rows.push({
      sheetName,
      rowNumber,
      values,
      rawRow: sanitizeRawRow(values)
    });
  }

  return {
    name: sheetName,
    isPresent: true,
    headers,
    missingColumns,
    rows
  };
}

function addSheetStructureIssues(sheet: ParsedSheet, issues: ExcelImportIssue[]) {
  const definition = SHEETS[sheet.name];

  for (const column of sheet.missingColumns) {
    issues.push({
      severity: "ERROR",
      sheetName: sheet.name,
      rowNumber: 1,
      fieldName: column,
      errorMessage: `Обязательная колонка ${column} отсутствует.`,
      rawRow: null
    });
  }

  const allowedColumns = new Set<string>(definition.columns);

  if (sheet.name === "AttendanceSource") {
    return;
  }

  for (const header of sheet.headers) {
    if (!allowedColumns.has(header)) {
      const ignoredSensitiveData = BALANCE_OR_HISTORY_COLUMN_PATTERN.test(header);

      issues.push({
        severity: "WARNING",
        sheetName: sheet.name,
        rowNumber: 1,
        fieldName: header,
        errorMessage: ignoredSensitiveData
          ? `Колонка ${header} игнорируется: балансы, переносы, оплаты и история посещаемости не импортируются в v1.`
          : `Лишняя колонка ${header} будет проигнорирована.`,
        rawRow: null
      });
    }
  }
}

function parseBranches(sheet: ParsedSheet, issues: ExcelImportIssue[]): BranchImportRow[] {
  return sheet.rows.map((row) => ({
    sourceRowNumber: row.rowNumber,
    code: requiredText(row, sheet, "branch_code", "Код филиала обязателен.", issues) ?? "",
    name: requiredText(row, sheet, "branch_name", "Название филиала обязательно.", issues) ?? "",
    address: optionalText(row, "address"),
    inventoryNotes: optionalText(row, "inventory_notes"),
    comment: optionalText(row, "comment"),
    status: parseEnum(row, "status", ENTITY_STATUSES, "ACTIVE", issues, "Некорректный статус филиала.")
  }));
}

async function parseCoaches(
  sheet: ParsedSheet,
  issues: ExcelImportIssue[],
  passwordHasher: (password: string) => Promise<string>
): Promise<CoachImportRow[]> {
  return Promise.all(
    sheet.rows.map(async (row) => {
      const temporaryPassword = optionalText(row, "temporary_password");

      return {
        sourceRowNumber: row.rowNumber,
        code: requiredText(row, sheet, "coach_code", "Код тренера обязателен.", issues) ?? "",
        fullName: requiredText(row, sheet, "full_name", "ФИО тренера обязательно.", issues) ?? "",
        login: requiredText(row, sheet, "login", "Логин тренера обязателен.", issues) ?? "",
        passwordHash: temporaryPassword ? await passwordHasher(temporaryPassword) : null,
        hasProvidedTemporaryPassword: Boolean(temporaryPassword),
        phone: parsePhone(row, "phone", issues),
        comment: optionalText(row, "comment"),
        status: parseEnum(row, "status", ENTITY_STATUSES, "ACTIVE", issues, "Некорректный статус тренера.")
      };
    })
  );
}

function parseGroups(sheet: ParsedSheet, issues: ExcelImportIssue[]): GroupImportRow[] {
  return sheet.rows.map((row) => ({
    sourceRowNumber: row.rowNumber,
    code: requiredText(row, sheet, "group_code", "Код группы обязателен.", issues) ?? "",
    name: requiredText(row, sheet, "group_name", "Название группы обязательно.", issues) ?? "",
    branchCode: requiredText(row, sheet, "branch_code", "Код филиала обязателен.", issues) ?? "",
    mainCoachCode: requiredText(row, sheet, "main_coach_code", "Код основного тренера обязателен.", issues) ?? "",
    capacityLimit: parseInteger(row, "capacity_limit", 15, issues),
    inventoryNotes: optionalText(row, "inventory_notes"),
    comment: optionalText(row, "comment"),
    status: parseEnum(row, "status", ENTITY_STATUSES, "ACTIVE", issues, "Некорректный статус группы.")
  }));
}

function parseParents(sheet: ParsedSheet, issues: ExcelImportIssue[]): ParentImportRow[] {
  return sheet.rows.map((row) => ({
    sourceRowNumber: row.rowNumber,
    code: requiredText(row, sheet, "parent_code", "Код родителя обязателен.", issues) ?? "",
    fullName: optionalText(row, "full_name"),
    phone: parsePhone(row, "phone", issues),
    vkProfileUrl: normalizeVk(row, "vk_profile_url", issues),
    comment: optionalText(row, "comment")
  }));
}

function parseChildren(sheet: ParsedSheet, issues: ExcelImportIssue[]): ChildImportRow[] {
  return sheet.rows.map((row) => ({
    sourceRowNumber: row.rowNumber,
    code: requiredText(row, sheet, "child_code", "Код ребёнка обязателен.", issues) ?? "",
    fullName: requiredText(row, sheet, "full_name", "ФИО ребёнка обязательно.", issues) ?? "",
    birthDate: parseDate(row, "birth_date", false, issues),
    parentCode: optionalText(row, "parent_code"),
    groupCode: requiredText(row, sheet, "group_code", "Код группы обязателен.", issues) ?? "",
    medicalNotes: optionalText(row, "medical_notes"),
    coachComment: optionalText(row, "coach_comment"),
    adminComment: optionalText(row, "admin_comment"),
    status: parseEnum(row, "status", CHILD_STATUSES, "ACTIVE", issues, "Некорректный статус ребёнка.")
  }));
}

function parseSchedule(sheet: ParsedSheet, issues: ExcelImportIssue[]): ScheduleImportRow[] {
  return sheet.rows.map((row) => {
    const endTime = parseTime(row, "end_time", false, issues);
    const startTime = parseTime(row, "start_time", true, issues) ?? "";

    if (!endTime) {
      addRowIssue(row, "end_time", "Время окончания обязательно для импорта расписания v1.", issues);
    } else if (startTime && endTime <= startTime) {
      addRowIssue(row, "end_time", "Время окончания должно быть позже времени начала.", issues);
    }

    return {
      sourceRowNumber: row.rowNumber,
      code: requiredText(row, sheet, "schedule_code", "Код строки расписания обязателен.", issues) ?? "",
      groupCode: requiredText(row, sheet, "group_code", "Код группы обязателен.", issues) ?? "",
      branchCode: optionalText(row, "branch_code"),
      coachCode: optionalText(row, "coach_code"),
      weekday: parseWeekday(row, "weekday", issues) ?? 0,
      startTime,
      endTime: endTime ?? "",
      status: parseEnum(row, "status", ENTITY_STATUSES, "ACTIVE", issues, "Некорректный статус расписания.")
    };
  });
}

function parseLessons(sheet: ParsedSheet, issues: ExcelImportIssue[]): LessonImportRow[] {
  return sheet.rows.map((row) => {
    const endTime = parseTime(row, "end_time", false, issues);
    const startTime = parseTime(row, "start_time", true, issues) ?? "";

    if (!endTime) {
      addRowIssue(row, "end_time", "Время окончания обязательно для импорта занятий v1.", issues);
    } else if (startTime && endTime <= startTime) {
      addRowIssue(row, "end_time", "Время окончания должно быть позже времени начала.", issues);
    }

    return {
      sourceRowNumber: row.rowNumber,
      code: requiredText(row, sheet, "lesson_code", "Код занятия обязателен.", issues) ?? "",
      groupCode: requiredText(row, sheet, "group_code", "Код группы обязателен.", issues) ?? "",
      branchCode: optionalText(row, "branch_code"),
      coachCode: optionalText(row, "coach_code"),
      lessonDate: parseDate(row, "lesson_date", true, issues) ?? "",
      startTime,
      endTime: endTime ?? "",
      status: parseEnum(row, "status", LESSON_STATUSES, "SCHEDULED", issues, "Некорректный статус занятия."),
      comment: optionalText(row, "comment")
    };
  });
}

function addCrossSheetIssues(payload: ExcelImportPayload, issues: ExcelImportIssue[]) {
  const branchCodes = new Set(payload.branches.map((row) => row.code).filter(Boolean));
  const coachCodes = new Set(payload.coaches.map((row) => row.code).filter(Boolean));
  const groupCodes = new Set(payload.groups.map((row) => row.code).filter(Boolean));
  const parentCodes = new Set(payload.parents.map((row) => row.code).filter(Boolean));

  for (const group of payload.groups) {
    if (group.branchCode && !branchCodes.has(group.branchCode)) {
      addPayloadIssue("Groups", group, "branch_code", `Филиал ${group.branchCode} не найден в листе Branches.`, issues);
    }

    if (group.mainCoachCode && !coachCodes.has(group.mainCoachCode)) {
      addPayloadIssue("Groups", group, "main_coach_code", `Тренер ${group.mainCoachCode} не найден в листе Coaches.`, issues);
    }
  }

  for (const child of payload.children) {
    if (child.groupCode && !groupCodes.has(child.groupCode)) {
      addPayloadIssue("Children", child, "group_code", `Группа ${child.groupCode} не найдена в листе Groups.`, issues);
    }

    if (child.parentCode && !parentCodes.has(child.parentCode)) {
      addPayloadIssue("Children", child, "parent_code", `Родитель ${child.parentCode} не найден в листе Parents.`, issues);
    }
  }

  for (const schedule of payload.schedule) {
    if (schedule.groupCode && !groupCodes.has(schedule.groupCode)) {
      addPayloadIssue("Schedule", schedule, "group_code", `Группа ${schedule.groupCode} не найдена в листе Groups.`, issues);
    }

    if (schedule.branchCode && !branchCodes.has(schedule.branchCode)) {
      addPayloadIssue("Schedule", schedule, "branch_code", `Филиал ${schedule.branchCode} не найден в листе Branches.`, issues);
    }

    if (schedule.coachCode && !coachCodes.has(schedule.coachCode)) {
      addPayloadIssue("Schedule", schedule, "coach_code", `Тренер ${schedule.coachCode} не найден в листе Coaches.`, issues);
    }
  }

  for (const lesson of payload.lessons) {
    if (lesson.groupCode && !groupCodes.has(lesson.groupCode)) {
      addPayloadIssue("Lessons", lesson, "group_code", `Группа ${lesson.groupCode} не найдена в листе Groups.`, issues);
    }

    if (lesson.branchCode && !branchCodes.has(lesson.branchCode)) {
      addPayloadIssue("Lessons", lesson, "branch_code", `Филиал ${lesson.branchCode} не найден в листе Branches.`, issues);
    }

    if (lesson.coachCode && !coachCodes.has(lesson.coachCode)) {
      addPayloadIssue("Lessons", lesson, "coach_code", `Тренер ${lesson.coachCode} не найден в листе Coaches.`, issues);
    }
  }
}

function addDuplicateIssues(payload: ExcelImportPayload, issues: ExcelImportIssue[]) {
  addCodeDuplicateIssues("Branches", "branch_code", payload.branches, (row) => row.code, issues);
  addCodeDuplicateIssues("Coaches", "coach_code", payload.coaches, (row) => row.code, issues);
  addCodeDuplicateIssues("Groups", "group_code", payload.groups, (row) => row.code, issues);
  addCodeDuplicateIssues("Parents", "parent_code", payload.parents, (row) => row.code, issues);
  addCodeDuplicateIssues("Schedule", "schedule_code", payload.schedule, (row) => row.code, issues);
  addCodeDuplicateIssues("Lessons", "lesson_code", payload.lessons, (row) => row.code, issues);

  addCompositeDuplicateIssues("Groups", "group_name", payload.groups, (row) => `${normalizeKey(row.branchCode)}|${normalizeKey(row.name)}`, "Группа с таким названием уже есть в этом филиале файла.", issues);
  addCompositeDuplicateIssues(
    "Schedule",
    "start_time",
    payload.schedule,
    (row) => `${normalizeKey(row.groupCode)}|${row.weekday}|${row.startTime}`,
    "Шаблон расписания с такой группой, днём и временем уже есть в файле.",
    issues
  );
  addCompositeDuplicateIssues(
    "Lessons",
    "start_time",
    payload.lessons,
    (row) => `${normalizeKey(row.groupCode)}|${row.lessonDate}|${row.startTime}`,
    "Занятие с такой группой, датой и временем уже есть в файле.",
    issues
  );
  addChildDuplicateIssues(payload.children, issues);
}

function addExistingDataIssues(payload: ExcelImportPayload, context: ExcelImportValidationContext, issues: ExcelImportIssue[]) {
  const existingBranchNames = toKeySet(context.existingBranchNames);
  const existingCoachLogins = toKeySet(context.existingCoachLogins);
  const existingParentPhones = new Set((context.existingParentPhones ?? []).map((phone) => phone.trim()).filter(Boolean));
  const existingChildKeys = new Set(context.existingChildNameBirthDateKeys ?? []);

  for (const branch of payload.branches) {
    if (branch.name && existingBranchNames.has(normalizeKey(branch.name))) {
      addPayloadIssue("Branches", branch, "branch_name", `Филиал ${branch.name} уже существует. Импорт работает в create-only режиме.`, issues);
    }
  }

  for (const coach of payload.coaches) {
    if (coach.login && existingCoachLogins.has(normalizeKey(coach.login))) {
      addPayloadIssue("Coaches", coach, "login", `Логин ${coach.login} уже используется.`, issues);
    }
  }

  for (const parent of payload.parents) {
    if (parent.phone && existingParentPhones.has(parent.phone)) {
      addPayloadIssue(
        "Parents",
        parent,
        "phone",
        `Родитель с телефоном ${parent.phone} уже есть в базе. Запись будет создана как новая, проверьте дубль вручную.`,
        issues,
        "WARNING"
      );
    }
  }

  for (const child of payload.children) {
    const childKey = buildChildNameBirthDateKey(child.fullName, child.birthDate);

    if (childKey && existingChildKeys.has(childKey)) {
      addPayloadIssue(
        "Children",
        child,
        "full_name",
        `Ребёнок ${child.fullName} с такой датой рождения уже есть в базе. Запись будет создана как новая, проверьте дубль вручную.`,
        issues,
        "WARNING"
      );
    }
  }
}

function addIgnoredAttendanceWarning(sheet: ParsedSheet, issues: ExcelImportIssue[]) {
  if (!sheet.isPresent) {
    return;
  }

  issues.push({
    severity: "WARNING",
    sheetName: "AttendanceSource",
    rowNumber: 1,
    fieldName: null,
    errorMessage: "Лист AttendanceSource найден, но историческая посещаемость не импортируется в v1.",
    rawRow: null
  });
}

function addIgnoredScheduleWindowWarnings(sheet: ParsedSheet, issues: ExcelImportIssue[]) {
  if (!sheet.isPresent) {
    return;
  }

  for (const column of ["valid_from", "valid_to"]) {
    const hasValues = sheet.rows.some((row) => !isEmpty(row.values[column]));

    if (hasValues) {
      issues.push({
        severity: "WARNING",
        sheetName: "Schedule",
        rowNumber: 1,
        fieldName: column,
        errorMessage: `Колонка ${column} пока не сохраняется: период действия расписания не реализован в модели v1.`,
        rawRow: null
      });
    }
  }
}

function addCodeDuplicateIssues<T extends { sourceRowNumber: number }>(
  sheetName: SheetName,
  fieldName: string,
  rows: T[],
  keyFor: (row: T) => string,
  issues: ExcelImportIssue[]
) {
  const seen = new Set<string>();

  for (const row of rows) {
    const value = keyFor(row);
    const key = normalizeKey(value);

    if (!key) {
      continue;
    }

    if (seen.has(key)) {
      addPayloadIssue(sheetName, row, fieldName, `${fieldName} дублируется: ${value}.`, issues);
      continue;
    }

    seen.add(key);
  }
}

function addCompositeDuplicateIssues<T extends { sourceRowNumber: number }>(
  sheetName: SheetName,
  fieldName: string,
  rows: T[],
  keyFor: (row: T) => string,
  message: string,
  issues: ExcelImportIssue[]
) {
  const seen = new Set<string>();

  for (const row of rows) {
    const key = keyFor(row);

    if (!key || key.includes("||")) {
      continue;
    }

    if (seen.has(key)) {
      addPayloadIssue(sheetName, row, fieldName, message, issues);
      continue;
    }

    seen.add(key);
  }
}

function addChildDuplicateIssues(children: ChildImportRow[], issues: ExcelImportIssue[]) {
  const seen = new Map<string, ChildImportRow>();

  for (const child of children) {
    const key = normalizeKey(child.code);

    if (!key) {
      continue;
    }

    const previous = seen.get(key);

    if (!previous) {
      seen.set(key, child);
      continue;
    }

    const message =
      previous.groupCode && child.groupCode && previous.groupCode !== child.groupCode
        ? `Ребёнок ${child.code} указан в нескольких группах: ${previous.groupCode} и ${child.groupCode}.`
        : `child_code дублируется: ${child.code}.`;

    addPayloadIssue("Children", child, "child_code", message, issues);
  }
}

function requiredText(row: ParsedRow, sheet: ParsedSheet, fieldName: string, message: string, issues: ExcelImportIssue[]) {
  if (sheet.missingColumns.has(fieldName)) {
    return null;
  }

  const value = optionalText(row, fieldName);

  if (!value) {
    addRowIssue(row, fieldName, message, issues);
  }

  return value;
}

function optionalText(row: ParsedRow, fieldName: string) {
  const value = row.values[fieldName];

  if (isEmpty(value)) {
    return null;
  }

  return String(value).trim();
}

function parseEnum<T extends readonly string[]>(row: ParsedRow, fieldName: string, allowed: T, fallback: T[number], issues: ExcelImportIssue[], message: string): T[number] {
  const value = optionalText(row, fieldName);

  if (!value) {
    return fallback;
  }

  const normalized = value.toUpperCase();

  if (allowed.includes(normalized)) {
    return normalized;
  }

  addRowIssue(row, fieldName, `${message} Допустимо: ${allowed.join(", ")}.`, issues);
  return fallback;
}

function parseInteger(row: ParsedRow, fieldName: string, fallback: number, issues: ExcelImportIssue[]) {
  const value = row.values[fieldName];

  if (isEmpty(value)) {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isInteger(parsed) || parsed < 1) {
    addRowIssue(row, fieldName, `${fieldName} должен быть положительным целым числом.`, issues);
    return fallback;
  }

  return parsed;
}

function parseDate(row: ParsedRow, fieldName: string, required: boolean, issues: ExcelImportIssue[]) {
  const value = row.values[fieldName];

  if (isEmpty(value)) {
    if (required) {
      addRowIssue(row, fieldName, `${fieldName} обязателен.`, issues);
    }

    return null;
  }

  if (value instanceof Date) {
    return dateToKey(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialDateToKey(value);
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime())) {
    return text;
  }

  addRowIssue(row, fieldName, `${fieldName} должен быть датой в формате YYYY-MM-DD.`, issues);
  return null;
}

function parseTime(row: ParsedRow, fieldName: string, required: boolean, issues: ExcelImportIssue[]) {
  const value = row.values[fieldName];

  if (isEmpty(value)) {
    if (required) {
      addRowIssue(row, fieldName, `${fieldName} обязателен.`, issues);
    }

    return null;
  }

  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);

  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  addRowIssue(row, fieldName, `${fieldName} должен быть временем в формате HH:mm.`, issues);
  return null;
}

function parseWeekday(row: ParsedRow, fieldName: string, issues: ExcelImportIssue[]) {
  const value = row.values[fieldName];

  if (isEmpty(value)) {
    addRowIssue(row, fieldName, "День недели обязателен.", issues);
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }

  const text = String(value).trim().toUpperCase();
  const numeric = Number(text);

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) {
    return numeric;
  }

  if (WEEKDAYS[text]) {
    return WEEKDAYS[text];
  }

  addRowIssue(row, fieldName, "День недели должен быть 1-7 или MONDAY-SUNDAY.", issues);
  return null;
}

function parsePhone(row: ParsedRow, fieldName: string, issues: ExcelImportIssue[]) {
  const value = optionalText(row, fieldName);

  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  addRowIssue(row, fieldName, `Телефон ${value} не удалось нормализовать, он будет сохранён как есть.`, issues, "WARNING");
  return value;
}

function normalizeVk(row: ParsedRow, fieldName: string, issues: ExcelImportIssue[]) {
  const value = optionalText(row, fieldName);

  if (!value) {
    return null;
  }

  if (/^https?:\/\/vk\.com\/.+/i.test(value)) {
    return value;
  }

  if (/^vk\.com\/.+/i.test(value)) {
    return `https://${value}`;
  }

  if (/^@[A-Za-z0-9_.]+$/.test(value)) {
    return `https://vk.com/${value.slice(1)}`;
  }

  addRowIssue(row, fieldName, `VK ${value} не удалось нормализовать, он будет сохранён как есть.`, issues, "WARNING");
  return value;
}

function addRowIssue(
  row: ParsedRow,
  fieldName: string,
  message: string,
  issues: ExcelImportIssue[],
  severity: ImportIssueSeverity = "ERROR"
) {
  issues.push({
    severity,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    fieldName,
    errorMessage: message,
    rawRow: row.rawRow
  });
}

function addPayloadIssue(
  sheetName: SheetName,
  row: { sourceRowNumber: number } | ParsedRow | null,
  fieldName: string,
  message: string,
  issues: ExcelImportIssue[],
  severity: ImportIssueSeverity = "ERROR"
) {
  issues.push({
    severity,
    sheetName,
    rowNumber: row ? ("rowNumber" in row ? row.rowNumber : row.sourceRowNumber) : null,
    fieldName,
    errorMessage: message,
    rawRow: row && "rawRow" in row ? row.rawRow : null
  });
}

function buildPreview(sheetByName: Record<SheetName, ParsedSheet>, payload: ExcelImportPayload, issues: ExcelImportIssue[], totalRows: number): ExcelImportPreview {
  const sheetRows: Record<SheetName, number> = {
    Branches: payload.branches.length,
    Coaches: payload.coaches.length,
    Groups: payload.groups.length,
    Parents: payload.parents.length,
    Children: payload.children.length,
    Schedule: payload.schedule.length,
    Lessons: payload.lessons.length,
    AttendanceSource: sheetByName.AttendanceSource.rows.length
  };
  const sheets: ExcelImportPreview["sheets"] = {};

  for (const sheetName of ALL_SHEET_NAMES) {
    sheets[sheetName] = {
      rows: sheetRows[sheetName],
      errors: issues.filter((issue) => issue.sheetName === sheetName && issue.severity === "ERROR").length,
      warnings: issues.filter((issue) => issue.sheetName === sheetName && issue.severity === "WARNING").length,
      imported: IMPORTED_SHEET_NAMES.includes(sheetName)
    };
  }

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;

  return {
    totalRows,
    errorCount,
    warningCount,
    canConfirm: errorCount === 0,
    sheets
  };
}

function countFailedRows(issues: ExcelImportIssue[]) {
  const rows = new Set<string>();

  for (const issue of issues) {
    if (issue.severity !== "ERROR" || issue.rowNumber === null) {
      continue;
    }

    rows.add(`${issue.sheetName}:${issue.rowNumber}`);
  }

  return rows.size;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;

  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date || typeof value !== "object") {
    return value;
  }

  const record = value as unknown as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  if (Array.isArray(record.richText)) {
    return record.richText.map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : "")).join("");
  }

  if ("result" in record) {
    return record.result;
  }

  return String(value);
}

function normalizeCell(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return value;
}

function normalizeHeader(value: unknown) {
  if (isEmpty(value)) {
    return null;
  }

  return String(value).trim().toLowerCase();
}

function sanitizeRawRow(row: Record<string, unknown>) {
  const sanitized = { ...row };

  if ("temporary_password" in sanitized) {
    sanitized.temporary_password = sanitized.temporary_password ? "[REDACTED]" : null;
  }

  return sanitized;
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || String(value).trim().length === 0;
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

function toKeySet(values: string[] | undefined) {
  return new Set((values ?? []).map(normalizeKey).filter(Boolean));
}

function dateToKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function excelSerialDateToKey(value: number) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 86_400_000).toISOString().slice(0, 10);
}
