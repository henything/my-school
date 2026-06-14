import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createTrial, listTrials } from "@/server/trials/trial-service";
import { createTrialSchema } from "@/server/trials/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const trials = await listTrials(currentUser.user);
  return NextResponse.json({ trials });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createTrialSchema.parse(await request.json().catch(() => ({})));
    const trial = await createTrial(currentUser.user, input);
    return NextResponse.json({ trial }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
