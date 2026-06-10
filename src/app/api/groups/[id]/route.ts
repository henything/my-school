import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateGroup } from "@/server/groups/group-service";
import { updateGroupSchema } from "@/server/groups/schemas";

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
    const input = updateGroupSchema.parse(await request.json().catch(() => ({})));
    const group = await updateGroup(currentUser.user, id, input);
    return NextResponse.json({ group });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No TrainingGroup found") ? 404 : message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 404 ? "Группа не найдена." : status === 409 ? "Группа с таким названием уже существует в филиале." : message, status);
  }
}
