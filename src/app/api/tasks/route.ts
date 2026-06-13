import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createManualTask, listTasks } from "@/server/tasks/task-service";
import { createManualTaskSchema } from "@/server/tasks/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const tasks = await listTasks(currentUser.user);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createManualTaskSchema.parse(await request.json().catch(() => ({})));
    const task = await createManualTask(currentUser.user, input);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
