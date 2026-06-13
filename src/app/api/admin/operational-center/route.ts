import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getOperationalCenter } from "@/server/tasks/task-service";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const operationalCenter = await getOperationalCenter(currentUser.user);
  return NextResponse.json({ operationalCenter });
}
