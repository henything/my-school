import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { getCurrentUser } from "@/server/auth/current-user";
import { registerProductionJourney } from "@/server/trials/fdoc-full-cycle-test";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "PARENT") return jsonError("Войдите в кабинет родителя.", 401);
    return NextResponse.json(await registerProductionJourney(await request.json(), user));
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
