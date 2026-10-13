import type { Prisma } from "@/generated/prisma/client";
import { todayInMoscow } from "./attendance-plan";

export async function resolveFirstPaidLessonDate(
  tx: Prisma.TransactionClient,
  schoolId: string,
  groupId: string | null | undefined,
  requestedDate: Date | null | undefined,
  trialDate?: Date
) {
  if (trialDate && !requestedDate) {
    throw new Error("Укажите дату первого платного занятия после пробного.");
  }

  const startDate = requestedDate ?? todayInMoscow();

  if (requestedDate) {
    if (!groupId) throw new Error("Для первого платного занятия нужно выбрать группу.");
    if (trialDate && requestedDate <= trialDate) {
      throw new Error("Первое платное занятие должно быть позже пробного.");
    }

    const lesson = await tx.lesson.findFirst({
      where: { schoolId, groupId, lessonDate: requestedDate, status: { not: "CANCELLED" } },
      select: { id: true }
    });
    if (!lesson) throw new Error("В выбранной группе нет занятия на дату первого платного посещения.");
  }

  return startDate;
}
