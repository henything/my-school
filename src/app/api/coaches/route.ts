import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createCoach, listCoaches } from "@/server/coaches/coach-service";
import { createCoachSchema } from "@/server/coaches/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const coaches = await listCoaches(currentUser.user);
  return NextResponse.json({ coaches });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createCoachSchema.parse(await request.json().catch(() => ({})));
    const coach = await createCoach(currentUser.user, input);
    return NextResponse.json({ coach }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Пользователь с таким логином уже существует." : message, status);
  }
}
