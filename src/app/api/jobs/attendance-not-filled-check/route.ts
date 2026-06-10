import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { runAttendanceNotFilledCheck } from "@/server/attendance/attendance-service";
import { attendanceNotFilledJobSchema } from "@/server/attendance/schemas";
import { requireApiUser } from "@/server/auth/api-user";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = attendanceNotFilledJobSchema.parse(await request.json().catch(() => ({})));
    const result = await runAttendanceNotFilledCheck(currentUser.user, input);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
