import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateParent } from "@/server/parents/parent-service";
import { updateParentSchema } from "@/server/parents/schemas";

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
    const input = updateParentSchema.parse(await request.json().catch(() => ({})));
    const parent = await updateParent(currentUser.user, id, input);
    return NextResponse.json({ parent });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No Parent found") ? 404 : 400;
    return jsonError(status === 404 ? "Родитель не найден." : message, status);
  }
}
