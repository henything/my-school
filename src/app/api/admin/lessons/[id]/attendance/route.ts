import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { correctAttendance } from "@/server/attendance/attendance-service";
import { correctAttendanceSchema } from "@/server/attendance/schemas";
import { requireApiUser } from "@/server/auth/api-user";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);

  try {
    const { id } = await params;
    const input = correctAttendanceSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ lesson: await correctAttendance(currentUser.user, id, input) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
