import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateUserStatus } from "@/server/users/user-service";
import { updateUserStatusSchema } from "@/server/users/schemas";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = updateUserStatusSchema.parse(await request.json().catch(() => ({})));
    const user = await updateUserStatus(currentUser.user, id, input.status);
    return NextResponse.json({ user });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No User found") ? 404 : 400;
    return jsonError(status === 404 ? "Пользователь не найден." : message, status);
  }
}
