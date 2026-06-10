import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createScheduleTemplate, listScheduleTemplates } from "@/server/schedule/lesson-service";
import { createScheduleTemplateSchema } from "@/server/schedule/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const scheduleTemplates = await listScheduleTemplates(currentUser.user);
  return NextResponse.json({ scheduleTemplates });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createScheduleTemplateSchema.parse(await request.json().catch(() => ({})));
    const scheduleTemplate = await createScheduleTemplate(currentUser.user, input);
    return NextResponse.json({ scheduleTemplate }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Такой шаблон расписания уже существует." : message, status);
  }
}
