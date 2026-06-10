import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createLesson, listLessons } from "@/server/schedule/lesson-service";
import { createLessonSchema } from "@/server/schedule/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const lessons = await listLessons(currentUser.user);
  return NextResponse.json({ lessons });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createLessonSchema.parse(await request.json().catch(() => ({})));
    const lesson = await createLesson(currentUser.user, input);
    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Занятие для этой группы, даты и времени уже существует." : message, status);
  }
}
