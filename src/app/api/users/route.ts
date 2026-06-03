import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createUser, listUsers } from "@/server/users/user-service";
import { createUserSchema } from "@/server/users/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const users = await listUsers(currentUser.user);
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createUserSchema.parse(await request.json().catch(() => ({})));
    const user = await createUser(currentUser.user, input);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Пользователь с таким логином уже существует." : message, status);
  }
}
