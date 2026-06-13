import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createGroupEvent, listGroupEvents } from "@/server/makeups/makeup-service";
import { createGroupEventSchema } from "@/server/makeups/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const groupEvents = await listGroupEvents(currentUser.user);
  return NextResponse.json({ groupEvents });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createGroupEventSchema.parse(await request.json().catch(() => ({})));
    const result = await createGroupEvent(currentUser.user, input);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
