import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildExcelImportDraft } from "./excel-validation";

type SheetRows = Record<string, Array<Record<string, unknown>>>;

describe("excel import validation", () => {
  it("builds a confirmable preview for a valid workbook and keeps passwords hashed", async () => {
    const draft = await buildExcelImportDraft(await workbookBuffer(validWorkbookRows()), {
      hashPassword: async (password) => `hash:${password}`
    });

    expect(draft.preview.canConfirm).toBe(true);
    expect(draft.preview.errorCount).toBe(0);
    expect(draft.preview.sheets.Branches.rows).toBe(1);
    expect(draft.preview.sheets.AttendanceSource.imported).toBe(false);
    expect(draft.preview.warningCount).toBeGreaterThanOrEqual(2);
    expect(draft.payload.coaches[0]?.passwordHash).toBe("hash:temp12345");
    expect(JSON.stringify(draft.issues)).not.toContain("temp12345");
  });

  it("blocks import when a child references a missing group", async () => {
    const rows = validWorkbookRows();
    rows.Children[0] = { ...rows.Children[0], group_code: "GR_999" };

    const draft = await buildExcelImportDraft(await workbookBuffer(rows), {
      hashPassword: async (password) => `hash:${password}`
    });

    expect(draft.preview.canConfirm).toBe(false);
    expect(draft.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "ERROR",
          sheetName: "Children",
          rowNumber: 2,
          fieldName: "group_code"
        })
      ])
    );
  });

  it("blocks duplicate child_code when a child is assigned to two groups", async () => {
    const rows = validWorkbookRows();
    rows.Groups.push({
      group_code: "GR_002",
      group_name: "Малыши 5-6",
      branch_code: "BR_001",
      main_coach_code: "COACH_001",
      capacity_limit: 15,
      status: "ACTIVE"
    });
    rows.Children.push({
      ...rows.Children[0],
      full_name: "Петров Миша duplicate",
      group_code: "GR_002"
    });

    const draft = await buildExcelImportDraft(await workbookBuffer(rows), {
      hashPassword: async (password) => `hash:${password}`
    });

    expect(draft.preview.canConfirm).toBe(false);
    expect(draft.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "ERROR",
          sheetName: "Children",
          rowNumber: 3,
          fieldName: "child_code",
          errorMessage: expect.stringContaining("нескольких группах")
        })
      ])
    );
  });

  it("treats existing login as a critical create-only conflict and existing parent phone as warning", async () => {
    const draft = await buildExcelImportDraft(await workbookBuffer(validWorkbookRows()), {
      existingCoachLogins: ["ivanov"],
      existingParentPhones: ["+79991234567"],
      hashPassword: async (password) => `hash:${password}`
    });

    expect(draft.preview.canConfirm).toBe(false);
    expect(draft.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "ERROR",
          sheetName: "Coaches",
          fieldName: "login"
        }),
        expect.objectContaining({
          severity: "WARNING",
          sheetName: "Parents",
          fieldName: "phone"
        })
      ])
    );
  });
});

async function workbookBuffer(sheets: SheetRows) {
  const workbook = new ExcelJS.Workbook();

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(sheetName);
    const headers = Object.keys(rows[0] ?? {});
    worksheet.addRow(headers);

    for (const row of rows) {
      worksheet.addRow(headers.map((header) => row[header] ?? null));
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function validWorkbookRows(): SheetRows {
  return {
    Branches: [
      {
        branch_code: "BR_001",
        branch_name: "Детский сад №1",
        address: "ул. Ленина, 10",
        status: "ACTIVE"
      }
    ],
    Coaches: [
      {
        coach_code: "COACH_001",
        full_name: "Иванов Иван",
        login: "ivanov",
        temporary_password: "temp12345",
        phone: "+7 999 123-45-67",
        status: "ACTIVE"
      }
    ],
    Groups: [
      {
        group_code: "GR_001",
        group_name: "Малыши 4-5",
        branch_code: "BR_001",
        main_coach_code: "COACH_001",
        capacity_limit: 15,
        status: "ACTIVE"
      }
    ],
    Parents: [
      {
        parent_code: "P_001",
        full_name: "Петрова Анна",
        phone: "+79991234567",
        vk_profile_url: "@example"
      }
    ],
    Children: [
      {
        child_code: "CH_001",
        full_name: "Петров Миша",
        birth_date: "2021-04-15",
        parent_code: "P_001",
        group_code: "GR_001",
        status: "ACTIVE",
        cached_lesson_balance: 12
      }
    ],
    Schedule: [
      {
        schedule_code: "SCH_001",
        group_code: "GR_001",
        weekday: "MONDAY",
        start_time: "18:00",
        end_time: "18:45",
        status: "ACTIVE"
      }
    ],
    AttendanceSource: [
      {
        old_attendance: "ignored"
      }
    ]
  };
}
