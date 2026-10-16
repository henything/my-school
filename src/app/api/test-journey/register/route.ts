import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { registerTestJourney } from "@/server/trials/fdoc-full-cycle-test";

export async function POST(request: Request) {
  try {
    const result = await registerTestJourney(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
