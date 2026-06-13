import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createVacation } from "@/server/makeups/makeup-service";
import { createVacationSchema } from "@/server/makeups/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = createVacationSchema.parse(await request.json().catch(() => ({})));
    const result = await createVacation(currentUser.user, id, input);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
