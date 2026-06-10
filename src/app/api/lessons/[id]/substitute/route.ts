import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { substituteLesson } from "@/server/schedule/lesson-service";
import { substituteLessonSchema } from "@/server/schedule/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = substituteLessonSchema.parse(await request.json().catch(() => ({})));
    const lesson = await substituteLesson(currentUser.user, id, input);
    return NextResponse.json({ lesson });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("No Lesson found") ? 404 : 400;
    return jsonError(status === 404 ? "Занятие не найдено." : message, status);
  }
}
