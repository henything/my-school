import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { getTestJourney, refreshTestJourney, simulateTestPayment, chooseTestSchedule, startTestSigning } from "@/server/trials/fdoc-full-cycle-test";
import { requireApiUser } from "@/server/auth/api-user";

export async function GET(request: Request) {
  const user = await requireApiUser(["PARENT", "ADMIN", "SUPER_ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return NextResponse.json(await getTestJourney(token, user.user));
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  const user = await requireApiUser(["PARENT", "ADMIN", "SUPER_ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const input = await request.json() as { token?: string; action?: string; attendanceWeekday?: number };
    if (input.action === "refresh") return NextResponse.json(await refreshTestJourney(input.token ?? "", user.user));
    if (input.action === "choose-schedule") return NextResponse.json(await chooseTestSchedule(input.token ?? "", user.user, input.attendanceWeekday));
    if (input.action === "start-signing") return NextResponse.json(await startTestSigning(input.token ?? "", user.user));
    if (input.action === "simulate-payment") return NextResponse.json(await simulateTestPayment(input.token ?? "", user.user));
    return jsonError("Неизвестное действие.", 400);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
