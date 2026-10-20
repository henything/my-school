import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { normalizeParentPhone } from "@/server/parents/phone";
import { createParentInvite } from "@/server/parents/parent-auth-service";
import { markInvoicePaidManually } from "@/server/billing/billing-service";
import { dateToKey } from "@/server/schedule/generation";
import { countActiveChildren } from "@/server/groups/capacity";
import { ensureGroupOverCapacityTask } from "@/server/tasks/task-service";
import { firstPaidLessonAfter, lessonStartsAt, paymentDeadline, reservationDeadline } from "./test-journey-rules";
import { createTrial, convertTrial } from "./trial-service";
import { syncTrialSigningByPackageId } from "./trial-signing-service";

const registrationSchema = z.object({
  accessCode: z.string().min(1),
  lessonId: z.uuid(),
  parentName: z.string().trim().min(2).max(150).regex(/^[\p{L}\s]+$/u, "Для F.Doc укажите ФИО буквами, без точек и цифр."),
  parentPhone: z.string().trim().min(10).max(30),
  childName: z.string().trim().min(2).max(150),
  childBirthDate: z.iso.date(),
  attendanceWeekday: z.coerce.number().int().min(0).max(7).default(0).transform((value) => value === 0 ? null : value)
});

function assertTestMode() {
  if (
    process.env.FDOC_FULL_CYCLE_TEST_ENABLED !== "true" ||
    (process.env.FDOC_BASE_URL ?? "https://demo.fdoc.ru") !== "https://demo.fdoc.ru" ||
    process.env.APP_BASE_URL !== "https://test.195.133.56.68.sslip.io" ||
    !process.env.FDOC_TEST_SCHOOL_ID ||
    !process.env.FDOC_TEST_SIGNUP_CODE
  ) throw new Error("Полный тестовый сценарий не настроен.");
  return { schoolId: process.env.FDOC_TEST_SCHOOL_ID, accessCode: process.env.FDOC_TEST_SIGNUP_CODE };
}

function equalSecret(actual: string, expected: string) {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function testAdmin(schoolId: string): Promise<CurrentUser> {
  const admin = await getPrisma().user.findFirstOrThrow({
    where: { schoolId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    orderBy: { createdAt: "asc" }
  });
  return { id: admin.id, schoolId, login: admin.login, displayName: admin.displayName, role: admin.role };
}

export async function testBookableLessons() {
  const { schoolId } = assertTestMode();
  const prisma = getPrisma();
  const rows = await prisma.lesson.findMany({
    where: { schoolId, status: { not: "CANCELLED" }, group: { status: "ACTIVE" } },
    orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
    take: 400,
    include: { group: { select: {
      name: true, capacityLimit: true,
      branch: { select: { name: true } },
      scheduleTemplates: { where: { status: "ACTIVE" }, select: { weekday: true } }
    } } }
  });
  const today = new Date();
  const earliest = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const latest = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const groupIds = [...new Set(rows.map((row) => row.groupId))];
  const [activeChildren, openReservations] = await Promise.all([
    prisma.child.groupBy({
      by: ["currentGroupId"], where: { schoolId, status: "ACTIVE", currentGroupId: { in: groupIds } },
      _count: { id: true }
    }),
    prisma.trialTestJourney.findMany({
      where: { schoolId, paidAt: null, reserveExpiresAt: { gt: today }, trial: { groupId: { in: groupIds } } },
      select: { trial: { select: { groupId: true } } }
    })
  ]);
  const activeByGroup = new Map(activeChildren.map((row) => [row.currentGroupId, row._count.id]));
  const reservedByGroup = new Map<string, number>();
  for (const reservation of openReservations) {
    reservedByGroup.set(reservation.trial.groupId, (reservedByGroup.get(reservation.trial.groupId) ?? 0) + 1);
  }
  return rows
    .filter((row) => row.lessonDate >= earliest && row.lessonDate <= latest &&
      (activeByGroup.get(row.groupId) ?? 0) + (reservedByGroup.get(row.groupId) ?? 0) < row.group.capacityLimit &&
      rows.some((next) => next.groupId === row.groupId && next.lessonDate > row.lessonDate))
    .slice(0, 40)
    .map((row) => ({
      id: row.id, date: dateToKey(row.lessonDate), time: row.startTime,
      group: row.group.name, branch: row.group.branch.name,
      weekdays: [...new Set(row.group.scheduleTemplates.map((template) => template.weekday))].sort()
    }));
}

export async function registerTestJourney(raw: unknown) {
  const { schoolId, accessCode } = assertTestMode();
  const input = registrationSchema.parse(raw);
  if (!equalSecret(input.accessCode, accessCode)) throw new Error("Неверный код доступа к тесту.");
  const phone = normalizeParentPhone(input.parentPhone);
  const birthDate = new Date(`${input.childBirthDate}T00:00:00.000Z`);
  const today = new Date();
  if (birthDate > today || birthDate.getUTCFullYear() < today.getUTCFullYear() - 18) throw new Error("Проверьте дату рождения ребёнка.");
  const age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const lesson = await getPrisma().lesson.findFirstOrThrow({
    where: { id: input.lessonId, schoolId, status: { not: "CANCELLED" }, group: { status: "ACTIVE" } },
    include: { group: { include: { scheduleTemplates: { where: { status: "ACTIVE" }, select: { weekday: true } } } } }
  });
  if (input.attendanceWeekday !== null &&
      !lesson.group.scheduleTemplates.some((template) => template.weekday === input.attendanceWeekday)) {
    throw new Error("В этой группе нет занятия в выбранный день недели.");
  }
  const [activeChildren, reservations] = await Promise.all([
    getPrisma().child.count({ where: { schoolId, currentGroupId: lesson.groupId, status: "ACTIVE" } }),
    getPrisma().trialTestJourney.count({ where: {
      schoolId, paidAt: null, reserveExpiresAt: { gt: today }, trial: { groupId: lesson.groupId }
    } })
  ]);
  if (activeChildren + reservations >= lesson.group.capacityLimit) {
    throw new Error("В выбранной группе сейчас нет свободного места.");
  }
  const admin = await testAdmin(schoolId);
  const trial = await createTrial(admin, {
    lessonId: lesson.id,
    childName: input.childName,
    childAge: age,
    parentName: input.parentName,
    parentPhone: phone,
    parentVkUrl: null,
    source: "OTHER",
    comment: "Из изолированного тестового сценария F.Doc"
  });
  const token = randomBytes(32).toString("base64url");
  await getPrisma().trialTestJourney.create({ data: {
    schoolId, trialId: trial.id, tokenHash: hashToken(token), childBirthDate: birthDate,
    attendanceWeekday: input.attendanceWeekday
  } });
  return { token };
}

async function findJourney(token: string) {
  const { schoolId } = assertTestMode();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Ссылка на тест недействительна.");
  const journey = await getPrisma().trialTestJourney.findFirst({
    where: { schoolId, tokenHash: hashToken(token) },
    include: { trial: { include: { lesson: true, signingPackage: true, convertedChild: true } } }
  });
  if (!journey) throw new Error("Ссылка на тест недействительна.");
  return journey;
}

async function invoiceForChild(schoolId: string, childId: string | null) {
  if (!childId) return null;
  return getPrisma().invoice.findFirst({
    where: { schoolId, childId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, amountKopeks: true, paidAmountKopeks: true, status: true, dueDate: true }
  });
}

export async function getTestJourney(token: string) {
  const journey = await findJourney(token);
  const trial = journey.trial;
  const invoice = await invoiceForChild(journey.schoolId, trial.convertedChildId);
  return {
    trialDate: dateToKey(trial.lesson.lessonDate),
    trialStatus: trial.status,
    trialAttended: trial.trialAttended,
    signingStatus: trial.signingPackage?.status ?? null,
    contractStatus: trial.signingPackage?.contractStatus ?? null,
    consentStatus: trial.signingPackage?.consentStatus ?? null,
    childStatus: trial.convertedChild?.status ?? null,
    attendanceWeekday: journey.attendanceWeekday,
    reserveExpiresAt: journey.reserveExpiresAt?.toISOString() ?? null,
    paymentDueAt: journey.paymentDueAt?.toISOString() ?? null,
    firstPaidLessonDate: journey.firstPaidLessonDate ? dateToKey(journey.firstPaidLessonDate) : null,
    invoice: invoice ? {
      number: invoice.number, amountKopeks: invoice.amountKopeks,
      paidAmountKopeks: invoice.paidAmountKopeks, status: invoice.status,
      dueDate: dateToKey(invoice.dueDate)
    } : null
  };
}

export async function refreshTestJourney(token: string) {
  const journey = await findJourney(token);
  const signing = journey.trial.signingPackage;
  if (signing && signing.status === "WAITING") await syncTrialSigningByPackageId(signing.id);
  await finalizeSignedTestJourneyByTrialId(journey.trialId);
  return getTestJourney(token);
}

export async function finalizeSignedTestJourneyByTrialId(trialId: string) {
  const updated = await getPrisma().trialTestJourney.findUnique({
    where: { trialId },
    include: { trial: { include: { lesson: true, signingPackage: true } } }
  });
  if (!updated) return;
  assertTestMode();
  if (updated.trial.signingPackage?.status !== "SIGNED" || updated.paymentDueAt) return;

  const now = new Date();
  if (updated.reserveExpiresAt && updated.reserveExpiresAt < now) {
    throw new Error("Срок резерва истёк. Администратор должен проверить место перед выставлением счёта.");
  }
  const dueAt = paymentDeadline(now);
  const lessons = await getPrisma().lesson.findMany({
    where: {
      schoolId: updated.schoolId, groupId: updated.trial.groupId,
      lessonDate: { gt: updated.trial.lesson.lessonDate }, status: { not: "CANCELLED" }
    },
    orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }],
    take: 80
  });
  const nextLesson = firstPaidLessonAfter(lessons, dueAt, updated.attendanceWeekday);
  if (!nextLesson) throw new Error("Документы подписаны, но следующее занятие ещё не создано. Добавьте его в расписание тестовой группы.");
  const admin = await testAdmin(updated.schoolId);
  try {
    await convertTrial(admin, updated.trialId, {
      existingChildId: null, existingParentId: null,
      childFullName: updated.trial.childName,
      parentName: updated.trial.parentName,
      parentPhone: updated.trial.parentPhone,
      parentVkUrl: null,
      currentGroupId: updated.trial.groupId,
      adminComment: "Тестовый полный цикл F.Doc",
      attendanceWeekday: updated.attendanceWeekday,
      attendancePlanStartDate: updated.attendanceWeekday === null ? null : nextLesson.lessonDate,
      firstPaidLessonDate: nextLesson.lessonDate
    }, { initialChildStatus: "PAUSED" });
  } catch (error) {
    const converted = await getPrisma().trialParticipant.findUnique({ where: { id: updated.trialId }, select: { convertedChildId: true } });
    if (!converted?.convertedChildId) throw error;
  }
  const converted = await getPrisma().trialParticipant.findUniqueOrThrow({ where: { id: updated.trialId }, select: { convertedChildId: true } });
  if (converted.convertedChildId) {
    await getPrisma().child.update({ where: { id: converted.convertedChildId }, data: { birthDate: updated.childBirthDate } });
    const invoice = await invoiceForChild(updated.schoolId, converted.convertedChildId);
    if (!invoice) throw new Error("Карточка создана, но счёт не сформировался. Проверьте расписание и абонемент.");
    await getPrisma().$transaction(async (tx) => {
      await tx.trialTestJourney.update({ where: { id: updated.id }, data: {
        paymentDueAt: dueAt,
        reserveExpiresAt: updated.reserveExpiresAt ? reservationDeadline(new Date(updated.reserveExpiresAt.getTime() - 72 * 60 * 60 * 1000), dueAt) : dueAt,
        firstPaidLessonDate: nextLesson.lessonDate
      } });
      await tx.invoice.update({ where: { id: invoice.id }, data: {
        dueDate: new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(dueAt)}T00:00:00.000Z`)
      } });
    });
  }
}

export async function simulateTestPayment(token: string) {
  const journey = await findJourney(token);
  if (journey.trial.signingPackage?.status !== "SIGNED" || !journey.trial.convertedChildId) {
    throw new Error("Сначала подпишите оба документа и обновите статус.");
  }
  const admin = await testAdmin(journey.schoolId);
  const invoice = await invoiceForChild(journey.schoolId, journey.trial.convertedChildId);
  if (!invoice) throw new Error("Счёт ещё не создан.");
  if (invoice.status !== "PAID") {
    await markInvoicePaidManually(admin, invoice.id, { comment: "ТЕСТ: имитация оплаты без списания денег" });
  }
  await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "trial_test_journeys" WHERE "id" = ${journey.id}::uuid FOR UPDATE`;
    const latest = await tx.trialTestJourney.findUniqueOrThrow({ where: { id: journey.id } });
    if (latest.paidAt) return;
    const paidAt = new Date();
    const childId = journey.trial.convertedChildId!;
    const paidInvoice = await tx.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { subscription: { include: { lessonSnapshots: { include: { lesson: { select: { startTime: true } } } } } } }
    });
    const missed = latest.paymentDueAt && paidAt > latest.paymentDueAt
      ? paidInvoice.subscription?.lessonSnapshots.filter((snapshot) =>
          lessonStartsAt({ lessonDate: snapshot.lessonDate, startTime: snapshot.lesson.startTime }) <= paidAt) ?? []
      : [];
    if (missed.length && paidInvoice.subscription) {
      const creditKopeks = Math.min(missed.length * paidInvoice.subscription.lessonPriceKopeks, paidInvoice.amountKopeks);
      if (creditKopeks > 0) {
        await tx.billingAdjustment.create({ data: {
          schoolId: journey.schoolId, childId, parentId: paidInvoice.parentId,
          sourceSubscriptionId: paidInvoice.subscription.id, sourceInvoiceId: paidInvoice.id,
          kind: "CREDIT", amountKopeks: creditKopeks, reason: "Поздняя оплата: занятия до подтверждения платежа",
          createdByUserId: admin.id
        } });
      }
      await tx.child.update({ where: { id: childId }, data: {
        cachedLessonBalance: { decrement: missed.length }
      } });
      await tx.lessonBalanceTransaction.create({ data: {
        schoolId: journey.schoolId, childId, subscriptionId: paidInvoice.subscription.id,
        type: "MANUAL_ADJUSTMENT", balanceType: "LESSON_BALANCE", amount: -missed.length,
        reason: "LATE_TRIAL_PAYMENT", createdByUserId: admin.id,
        comment: "Исключены занятия, прошедшие до подтверждения поздней оплаты"
      } });
    }
    const future = await tx.lesson.findMany({
      where: { schoolId: journey.schoolId, groupId: journey.trial.groupId,
        lessonDate: { gte: new Date(paidAt.toISOString().slice(0, 10)) }, status: { not: "CANCELLED" } },
      orderBy: [{ lessonDate: "asc" }, { startTime: "asc" }], take: 60
    });
    const nextLesson = firstPaidLessonAfter(future, paidAt, latest.attendanceWeekday);
    if (nextLesson && latest.firstPaidLessonDate && nextLesson.lessonDate > latest.firstPaidLessonDate) {
      await tx.childGroupMembership.updateMany({
        where: { childId, endDate: null }, data: { startDate: nextLesson.lessonDate }
      });
      if (latest.attendanceWeekday !== null) {
        await tx.childAttendancePlan.updateMany({
          where: { childId, effectiveFrom: latest.firstPaidLessonDate },
          data: { effectiveFrom: nextLesson.lessonDate }
        });
      }
    }
    await tx.child.update({ where: { id: childId }, data: { status: "ACTIVE" } });
    await tx.trialTestJourney.update({ where: { id: journey.id }, data: { paidAt } });
    const group = await tx.trainingGroup.findUniqueOrThrow({
      where: { id: journey.trial.groupId },
      select: { id: true, name: true, capacityLimit: true, children: { select: { status: true } } }
    });
    await ensureGroupOverCapacityTask(tx, {
      schoolId: journey.schoolId, actorUserId: admin.id,
      groupId: group.id, groupName: group.name,
      activeChildrenCount: countActiveChildren(group.children), capacityLimit: group.capacityLimit
    });
  });
  const parent = await getPrisma().child.findUniqueOrThrow({ where: { id: journey.trial.convertedChildId }, select: { parentId: true, parent: { select: { account: { select: { status: true } } } } } });
  const invite = parent.parentId && parent.parent?.account?.status !== "ACTIVE" ? await createParentInvite(admin, { parentId: parent.parentId }) : null;
  return { journey: await getTestJourney(token), activationUrl: invite ? `/parent/activate?token=${encodeURIComponent(invite.token)}` : null };
}
