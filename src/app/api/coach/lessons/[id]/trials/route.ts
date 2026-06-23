import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { assertNoCoachForbiddenFinancialFields } from "@/server/rbac/rbac";
import { createTrial, listLessonTrials } from "@/server/trials/trial-service";
import { createTrialSchema } from "@/server/trials/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const trials = await listLessonTrials(currentUser.user, id);
    const payload = { trials };
    assertNoCoachForbiddenFinancialFields(currentUser.user, payload);
    return NextResponse.json(payload);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = createTrialSchema.parse({ ...(await request.json().catch(() => ({}))), lessonId: id });
    const trial = await createTrial(currentUser.user, input);
    const payload = { trial };
    assertNoCoachForbiddenFinancialFields(currentUser.user, payload);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
