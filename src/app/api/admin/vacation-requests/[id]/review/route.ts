import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { reviewVacationRequest } from "@/server/vacation-requests/vacation-request-service";
import { reviewVacationRequestSchema } from "@/server/vacation-requests/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = reviewVacationRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await reviewVacationRequest(currentUser.user, id, input);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
