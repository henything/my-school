import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createChildEnrollment } from "@/server/children/child-service";
import { createChildEnrollmentSchema } from "@/server/children/schemas";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createChildEnrollmentSchema.parse(await request.json().catch(() => ({})));
    const enrollment = await createChildEnrollment(currentUser.user, input);
    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
