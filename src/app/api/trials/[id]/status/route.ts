import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateTrialStatus } from "@/server/trials/trial-service";
import { updateTrialStatusSchema } from "@/server/trials/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = updateTrialStatusSchema.parse(await request.json().catch(() => ({})));
    const trial = await updateTrialStatus(currentUser.user, id, input);
    return NextResponse.json({ trial });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
