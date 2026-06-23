import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { getCoachLessonDetail } from "@/server/attendance/attendance-service";
import { requireApiUser } from "@/server/auth/api-user";
import { assertNoCoachForbiddenFinancialFields } from "@/server/rbac/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const lesson = await getCoachLessonDetail(currentUser.user, id);
    const payload = { lesson };
    assertNoCoachForbiddenFinancialFields(currentUser.user, payload);
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
