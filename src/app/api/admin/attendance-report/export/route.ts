import ExcelJS from "exceljs";
import { requireApiUser } from "@/server/auth/api-user";
import { getAttendanceReport } from "@/server/analytics/attendance-report-service";
import { errorMessage, jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const params = new URL(request.url).searchParams;
    const report = await getAttendanceReport(currentUser.user, {
      from: params.get("from") ?? undefined, to: params.get("to") ?? undefined,
      branchId: params.get("branchId") ?? undefined, groupId: params.get("groupId") ?? undefined
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Посещаемость");
    sheet.addRow(["Филиал", "Группа", "Ребёнок", "Статус", ...report.dates]);
    for (const row of report.rows) sheet.addRow([row.branchName, row.groupName, row.childName, row.childStatus, ...report.dates.map((date) => row.byDate[date])]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => { column.width = 23; });
    const capacity = workbook.addWorksheet("Загрузка групп");
    capacity.addRow(["Филиал", "Группа", "Активных детей", "Вместимость"]);
    for (const group of report.groups) capacity.addRow([group.branchName, group.name, group.activeChildren, group.capacity]);
    capacity.getRow(1).font = { bold: true };
    capacity.columns.forEach((column) => { column.width = 24; });
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-${report.from}-${report.to}.xlsx"`,
      "Cache-Control": "no-store"
    } });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
