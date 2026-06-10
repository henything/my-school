import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateCoach } from "@/server/coaches/coach-service";
import { updateCoachSchema } from "@/server/coaches/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = updateCoachSchema.parse(await request.json().catch(() => ({})));
    const coach = await updateCoach(currentUser.user, id, input);
    return NextResponse.json({ coach });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No CoachProfile found") ? 404 : 400;
    return jsonError(status === 404 ? "Тренер не найден." : message, status);
  }
}
