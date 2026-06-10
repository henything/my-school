import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateChild } from "@/server/children/child-service";
import { updateChildSchema } from "@/server/children/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser();

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = updateChildSchema.parse(await request.json().catch(() => ({})));
    const child = await updateChild(currentUser.user, id, input);
    return NextResponse.json({ child });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No Child found") ? 404 : message.includes("Недостаточно прав") ? 403 : 400;
    return jsonError(status === 404 ? "Ребёнок не найден." : message, status);
  }
}
