import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createParent, listParents } from "@/server/parents/parent-service";
import { createParentSchema } from "@/server/parents/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const parents = await listParents(currentUser.user);
  return NextResponse.json({ parents });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createParentSchema.parse(await request.json().catch(() => ({})));
    const parent = await createParent(currentUser.user, input);
    return NextResponse.json({ parent }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
