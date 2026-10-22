import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { registerTestJourney } from "@/server/trials/fdoc-full-cycle-test";
import { getCurrentUser } from "@/server/auth/current-user";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "PARENT") return jsonError("Сначала зарегистрируйтесь или войдите в кабинет родителя.", 401);
    const result = await registerTestJourney(await request.json(), currentUser);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
