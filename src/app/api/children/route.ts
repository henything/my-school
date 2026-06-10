import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createChild, listChildren } from "@/server/children/child-service";
import { createChildSchema } from "@/server/children/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const children = await listChildren(currentUser.user);
  return NextResponse.json({ children });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createChildSchema.parse(await request.json().catch(() => ({})));
    const child = await createChild(currentUser.user, input);
    return NextResponse.json({ child }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
