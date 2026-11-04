import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hashSessionToken } from "@/server/auth/session-token";

export function enrollmentInviteToken(id: string) {
  return `${id}.${hashSessionToken(`trial-enrollment:${id}`)}`;
}

export function enrollmentInviteId(token: string) {
  const [id, signature, extra] = token.split(".");
  if (extra || !z.uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(signature ?? "")) throw new Error("Ссылка для регистрации недействительна.");
  const expected = enrollmentInviteToken(id).split(".")[1];
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Ссылка для регистрации недействительна.");
  return id;
}

export function assertWalkInReady(trial: { status: string; trialAttended: boolean | null; convertedChildId: string | null; testJourney: unknown; signingPackage: unknown }) {
  if (trial.status !== "WANTS_TO_CONTINUE" || trial.trialAttended !== true) throw new Error("Сначала отметьте присутствие, контакт с родителем и решение «Будет ходить».");
  if (trial.convertedChildId || trial.testJourney || trial.signingPackage) throw new Error("Для ребёнка уже начато оформление. Продолжите существующую заявку.");
}
