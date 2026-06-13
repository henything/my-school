import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { closeTask } from "@/server/tasks/task-service";
import { closeTaskSchema } from "@/server/tasks/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = closeTaskSchema.parse(await request.json().catch(() => ({})));
    const task = await closeTask(currentUser.user, id, input);
    return NextResponse.json({ task });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
