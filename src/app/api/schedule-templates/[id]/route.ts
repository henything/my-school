import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { deleteScheduleTemplate } from "@/server/schedule/lesson-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);

  try {
    const { id } = await context.params;
    const scheduleTemplate = await deleteScheduleTemplate(currentUser.user, id);
    return NextResponse.json({ scheduleTemplate });
  } catch (error) {
    const message = errorMessage(error);
    return jsonError(message, message === "Шаблон расписания не найден." ? 404 : 400);
  }
}
