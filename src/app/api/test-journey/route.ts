import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { getTestJourney, refreshTestJourney, simulateTestPayment } from "@/server/trials/fdoc-full-cycle-test";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    return NextResponse.json(await getTestJourney(token));
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { token?: string; action?: string };
    if (input.action === "refresh") return NextResponse.json(await refreshTestJourney(input.token ?? ""));
    if (input.action === "simulate-payment") return NextResponse.json(await simulateTestPayment(input.token ?? ""));
    return jsonError("Неизвестное действие.", 400);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
