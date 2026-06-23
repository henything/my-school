import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { saveCoachAttendance } from "@/server/attendance/attendance-service";
import { saveAttendanceSchema } from "@/server/attendance/schemas";
import { requireApiUser } from "@/server/auth/api-user";
import { assertNoCoachForbiddenFinancialFields } from "@/server/rbac/rbac";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = saveAttendanceSchema.parse(await request.json().catch(() => ({})));
    const lesson = await saveCoachAttendance(currentUser.user, id, input);
    const payload = { lesson };
    assertNoCoachForbiddenFinancialFields(currentUser.user, payload);
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
