import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { convertTrial } from "@/server/trials/trial-service";
import { convertTrialSchema } from "@/server/trials/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = convertTrialSchema.parse(await request.json().catch(() => ({})));
    const result = await convertTrial(currentUser.user, id, input);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
