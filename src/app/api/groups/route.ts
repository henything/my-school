import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createGroup, listGroups } from "@/server/groups/group-service";
import { createGroupSchema } from "@/server/groups/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const groups = await listGroups(currentUser.user);
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createGroupSchema.parse(await request.json().catch(() => ({})));
    const group = await createGroup(currentUser.user, input);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Группа с таким названием уже существует в филиале." : message, status);
  }
}
