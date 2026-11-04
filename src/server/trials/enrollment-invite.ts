import { randomBytes } from "node:crypto";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { writeAuditLog } from "@/server/audit/audit-service";
import { requestBenefit } from "@/server/parents/benefit-service";
import { readBenefitEvidence } from "@/server/parents/benefit-evidence";
import { registrationSchema, signupParent } from "./fdoc-full-cycle-test";
import { activeBookingGroup, assertBookingOpen, contextFor, type JourneyMode } from "./journey-context";
import { enrollmentInviteId, enrollmentInviteToken, assertWalkInReady } from "./enrollment-invite-rules";
import { ensureWalkInInvite } from "./enrollment-reservations";
import { lessonStartsAt } from "./test-journey-rules";

export function enrollmentMode(): JourneyMode {
  return process.env.FDOC_ENVIRONMENT === "PRODUCTION" ? "PRODUCTION" : "TEST";
}

const inviteInclude = { trial: { include: { lesson: true, group: { include: { branch: true } }, testJourney: true, signingPackage: true } } } as const;

export async function issueEnrollmentInvite(user: CurrentUser, trialId: string) {
  if (!["ADMIN", "SUPER_ADMIN", "COACH"].includes(user.role)) throw new Error("Недостаточно прав.");
  const mode = enrollmentMode(); assertBookingOpen(mode);
  const { schoolId, groupId } = await contextFor(mode);
  if (schoolId !== user.schoolId) throw new Error("Пробник недоступен.");
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "trial_participants" WHERE "id" = ${trialId}::uuid FOR UPDATE`;
    const trial = await tx.trialParticipant.findFirstOrThrow({ where: { id: trialId, schoolId, ...(groupId ? { groupId } : {}) }, include: {
      lesson: { select: { coach: { select: { userId: true } }, substituteCoach: { select: { userId: true } } } }, testJourney: true, signingPackage: true
    } });
    if (user.role === "COACH" && trial.lesson.coach.userId !== user.id && trial.lesson.substituteCoach?.userId !== user.id) throw new Error("Пробник недоступен этому тренеру.");
    assertWalkInReady(trial);
    const invite = await ensureWalkInInvite(tx, trial.id, trial.groupId);
    await writeAuditLog({ schoolId, actorUserId: user.id, action: "TRIAL_ENROLLMENT_INVITE_ISSUED", entityType: "TrialParticipant", entityId: trial.id, newValue: { inviteId: invite.id, expiresAt: invite.expiresAt.toISOString() } }, tx);
    return { path: `/join/after-trial?invite=${enrollmentInviteToken(invite.id)}`, expiresAt: invite.expiresAt.toISOString() };
  });
}

async function findInvite(token: string) {
  const mode = enrollmentMode(); assertBookingOpen(mode);
  const { schoolId, groupId } = await contextFor(mode);
  const invite = await getPrisma().trialEnrollmentInvite.findFirst({ where: { id: enrollmentInviteId(token), trial: { schoolId, ...(groupId ? { groupId } : {}) } }, include: inviteInclude });
  if (!invite) throw new Error("Ссылка для регистрации недействительна.");
  if (!invite.claimedAt) {
    assertWalkInReady(invite.trial);
    if (invite.expiresAt <= new Date()) throw new Error("Срок ссылки истёк. Попросите тренера или администратора обновить её.");
    if (invite.trial.lesson.status === "CANCELLED" || invite.trial.group.status !== "ACTIVE" || invite.trial.group.branch.status !== "ACTIVE") throw new Error("Запись в эту группу закрыта. Обратитесь к администратору.");
  }
  return { invite, mode, schoolId };
}

export async function previewEnrollmentInvite(token: string, user: CurrentUser | null) {
  const { invite, mode, schoolId } = await findInvite(token);
  if (invite.claimedAt) {
    const account = user?.role === "PARENT" && user.schoolId === schoolId ? await getPrisma().parentAccount.findFirst({ where: { schoolId, userId: user.id, parentId: invite.claimedParentId!, status: "ACTIVE" } }) : null;
    if (!account) return { mode, claimed: true as const };
    return { mode, claimed: true as const, journeyId: invite.trial.testJourney?.id };
  }
  return { mode, claimed: false as const, childName: invite.trial.childName ?? "", trialDate: invite.trial.lesson.lessonDate.toISOString().slice(0, 10), trialTime: invite.trial.lesson.startTime, group: invite.trial.group.name, address: invite.trial.group.address ?? invite.trial.group.branch.address ?? "", branch: invite.trial.group.branch.name, expiresAt: invite.expiresAt.toISOString() };
}

export async function signupAfterTrial(token: string, raw: unknown) {
  const { invite, mode } = await findInvite(token);
  if (invite.claimedAt) throw new Error("Ссылка уже использована. Войдите в кабинет родителя.");
  const context = await contextFor(mode);
  return signupParent(mode === "TEST" ? { ...(typeof raw === "object" && raw ? raw : {}), accessCode: context.accessCode } : raw, mode);
}

export async function claimEnrollmentInvite(token: string, raw: unknown, user: CurrentUser, file?: File) {
  const { invite, mode, schoolId } = await findInvite(token);
  if (user.role !== "PARENT" || user.schoolId !== schoolId) throw new Error("Войдите в кабинет родителя.");
  const input = registrationSchema.omit({ lessonId: true }).parse(raw);
  const birthDate = new Date(`${input.childBirthDate}T00:00:00.000Z`);
  const now = new Date();
  if (birthDate > now || birthDate.getUTCFullYear() < now.getUTCFullYear() - 18) throw new Error("Проверьте дату рождения ребёнка.");
  if (file && !input.benefitCategory) throw new Error("Выберите категорию льготы для документа.");
  const evidence = file ? await readBenefitEvidence(file) : undefined;
  return getPrisma().$transaction(async tx => {
    // Same lock order as status updates/conversion; one claimant and one journey per trial.
    await tx.$queryRaw`SELECT "id" FROM "trial_participants" WHERE "id" = ${invite.trialId}::uuid FOR UPDATE`;
    const current = await tx.trialEnrollmentInvite.findUniqueOrThrow({ where: { id: invite.id }, include: inviteInclude });
    let account = await tx.parentAccount.findFirstOrThrow({ where: { schoolId, userId: user.id, status: "ACTIVE", parent: { archivedAt: null } }, include: { parent: true } });
    if (current.claimedAt) {
      if (current.claimedParentId !== account.parentId || !current.trial.testJourney) throw new Error("Ссылка уже использована другим родителем.");
      return { token: current.trial.testJourney.id, mode };
    }
    assertWalkInReady(current.trial);
    if (current.expiresAt <= new Date()) throw new Error("Срок ссылки истёк. Обратитесь к тренеру или администратору.");
    await tx.$queryRaw`SELECT "id" FROM "groups" WHERE "id" = ${current.trial.groupId}::uuid FOR UPDATE`;
    await tx.trainingGroup.findFirstOrThrow({ where: { id: current.trial.groupId, schoolId, ...activeBookingGroup } });
    if (current.trial.lesson.status === "CANCELLED" || lessonStartsAt(current.trial.lesson) > new Date()) throw new Error("Сначала должно состояться пробное занятие.");
    await tx.$queryRaw`SELECT "id" FROM "parents" WHERE "id" = ${account.parentId}::uuid FOR UPDATE`;
    // A merge/archive may have changed ownership while the group lock was awaited.
    account = await tx.parentAccount.findFirstOrThrow({ where: { schoolId, userId: user.id, parentId: account.parentId, status: "ACTIVE", parent: { archivedAt: null } }, include: { parent: true } });
    if (account.parent.fullName && account.parent.fullName.trim().toLocaleLowerCase("ru") !== input.parentName.toLocaleLowerCase("ru")) throw new Error("Используйте имя и фамилию своего кабинета.");
    const existingChild = await tx.child.findFirst({ where: { schoolId, parentId: account.parentId, fullName: input.childName, birthDate, status: { not: "ARCHIVED" } } });
    if (existingChild) throw new Error("Карточка этого ребёнка уже есть. Попросите администратора связать записи.");
    const parent = await tx.parent.update({ where: { id: account.parentId }, data: { fullName: input.parentName, vkProfileUrl: input.parentVkUrl || account.parent.vkProfileUrl } });
    await requestBenefit(tx, user, parent.id, input.benefitCategory, evidence);
    await tx.user.update({ where: { id: user.id }, data: { displayName: input.parentName } });
    const child = await tx.child.create({ data: { schoolId, parentId: parent.id, fullName: input.childName, birthDate, status: "TRIAL" } });
    await tx.trialParticipant.update({ where: { id: current.trialId }, data: { convertedChildId: child.id, childName: input.childName, parentName: input.parentName, parentPhone: parent.phone, parentVkUrl: parent.vkProfileUrl } });
    const journey = await tx.trialTestJourney.create({ data: { schoolId, trialId: current.trialId, mode, tokenHash: randomBytes(32).toString("hex"), childBirthDate: birthDate, reserveExpiresAt: current.expiresAt } });
    await tx.trialEnrollmentInvite.update({ where: { id: current.id }, data: { claimedAt: new Date(), claimedParentId: parent.id } });
    await writeAuditLog({ schoolId, actorUserId: user.id, action: "TRIAL_ENROLLMENT_INVITE_CLAIMED", entityType: "TrialParticipant", entityId: current.trialId, newValue: { inviteId: current.id, parentId: parent.id, childId: child.id, journeyId: journey.id } }, tx);
    return { token: journey.id, mode };
  }, { timeout: 15_000 });
}
