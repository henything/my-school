import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { previewAttendanceCorrection, saveAttendanceCorrection } from "@/server/attendance/attendance-correction-workflow";
import { correctAttendanceSchema } from "@/server/attendance/schemas";
import { requireApiUser } from "@/server/auth/api-user";

const saveSchema = correctAttendanceSchema.extend({ expectedRevision: z.string().length(64), paidDifferenceAction: z.enum(["CREDIT", "REFUND_DUE"]).optional() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const input = correctAttendanceSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ preview: await previewAttendanceCorrection(currentUser.user, id, input) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);

  try {
    const { id } = await params;
    const input = saveSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await saveAttendanceCorrection(currentUser.user, id, input, input.expectedRevision, input.paidDifferenceAction));
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
