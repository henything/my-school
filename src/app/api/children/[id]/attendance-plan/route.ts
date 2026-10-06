import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { setChildAttendancePlan } from "@/server/children/child-service";
import { setChildAttendancePlanSchema } from "@/server/children/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);

  try {
    const { id } = await context.params;
    const input = setChildAttendancePlanSchema.parse(await request.json().catch(() => ({})));
    const plan = await setChildAttendancePlan(currentUser.user, id, input);
    return NextResponse.json({ plan });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
