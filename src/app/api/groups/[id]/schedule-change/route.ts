import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { uuidSchema } from "@/server/shared/schemas";
import { scheduleChangeSchema } from "@/server/schedule/change-schema";
import { changeGroupSchedule } from "@/server/schedule/change-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(ADMIN_ROLES);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const id = uuidSchema.parse((await context.params).id);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Проверьте параметры изменения расписания.");
    if (body.groupId !== undefined && body.groupId !== id) return jsonError("Группа в запросе не совпадает с выбранной группой.");
    const input = scheduleChangeSchema.parse({ ...body, groupId: id });
    return NextResponse.json({ result: await changeGroupSchedule(auth.user, input) });
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes("No TrainingGroup found")) return jsonError("Группа не найдена.", 404);
    if (message.includes("write conflict") || message.includes("P2034") || message.includes("новый предварительный")) {
      return jsonError("Расписание, табели или счета изменились. Получите новый предварительный расчёт.", 409);
    }
    return jsonError(message, 400);
  }
}
