import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { updateAttendanceRecord } from "@/server/attendance/attendance-service";
import { updateAttendanceRecordSchema } from "@/server/attendance/schemas";
import { requireApiUser } from "@/server/auth/api-user";

export async function PATCH(request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { recordId } = await params;
    const input = updateAttendanceRecordSchema.parse(await request.json().catch(() => ({})));
    const lesson = await updateAttendanceRecord(currentUser.user, recordId, input);
    return NextResponse.json({ lesson });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
