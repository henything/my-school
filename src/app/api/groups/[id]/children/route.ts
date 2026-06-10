import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { attachChildToGroup } from "@/server/groups/group-service";
import { attachChildToGroupSchema } from "@/server/groups/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = attachChildToGroupSchema.parse(await request.json().catch(() => ({})));
    const group = await attachChildToGroup(currentUser.user, id, input);
    return NextResponse.json({ group });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
