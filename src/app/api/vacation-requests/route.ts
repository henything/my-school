import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { createVacationRequest, listVacationRequests } from "@/server/vacation-requests/vacation-request-service";
import { createVacationRequestSchema } from "@/server/vacation-requests/schemas";

export async function GET() {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const vacationRequests = await listVacationRequests(currentUser.user);
    return NextResponse.json({ vacationRequests });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "PARENT"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const formData = await request.formData();
    const input = createVacationRequestSchema.parse({
      childId: formData.get("childId"),
      periodStart: formData.get("periodStart"),
      periodEnd: formData.get("periodEnd"),
      comment: formData.get("comment")
    });
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Прикрепите заявление.", 400);
    }

    const vacationRequest = await createVacationRequest(currentUser.user, input, file);
    return NextResponse.json({ vacationRequest }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
