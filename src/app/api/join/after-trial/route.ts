import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/current-user";
import { claimEnrollmentInvite } from "@/server/trials/enrollment-invite";
import { readRegistrationRequest } from "@/server/trials/registration-request";
import { errorMessage, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARENT") return jsonError("Войдите в кабинет родителя.", 401);
  try {
    const { input, file } = await readRegistrationRequest(request);
    const body = input as { invite?: string };
    if (typeof body?.invite !== "string") return jsonError("Нужна персональная ссылка.", 400);
    return NextResponse.json(await claimEnrollmentInvite(body.invite, input, user, file), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
