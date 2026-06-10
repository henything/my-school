import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateBranch } from "@/server/branches/branch-service";
import { updateBranchSchema } from "@/server/branches/schemas";

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
    const input = updateBranchSchema.parse(await request.json().catch(() => ({})));
    const branch = await updateBranch(currentUser.user, id, input);
    return NextResponse.json({ branch });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No Branch found") ? 404 : message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 404 ? "Филиал не найден." : status === 409 ? "Филиал с таким названием уже существует." : message, status);
  }
}
