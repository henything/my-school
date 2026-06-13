import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getTasksForUser } from "@/server/tasks/task-service";

export async function GET() {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const tasks = await getTasksForUser(currentUser.user);
  return NextResponse.json({ tasks });
}
