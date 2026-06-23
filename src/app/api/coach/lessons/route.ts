import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { assertNoCoachForbiddenFinancialFields } from "@/server/rbac/rbac";
import { listCoachLessons } from "@/server/schedule/lesson-service";

export async function GET() {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const lessons = await listCoachLessons(currentUser.user);
    const payload = { lessons };
    assertNoCoachForbiddenFinancialFields(currentUser.user, payload);
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
