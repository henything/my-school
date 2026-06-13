import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { listMakeups } from "@/server/makeups/makeup-service";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const makeups = await listMakeups(currentUser.user);
  return NextResponse.json({ makeups });
}
