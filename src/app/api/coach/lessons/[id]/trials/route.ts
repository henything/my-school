import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
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
    return NextResponse.json({ trials });
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
    return NextResponse.json({ trial }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
