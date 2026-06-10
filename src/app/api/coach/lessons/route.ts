import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { listCoachLessons } from "@/server/schedule/lesson-service";

export async function GET() {
  const currentUser = await requireApiUser(["COACH"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const lessons = await listCoachLessons(currentUser.user);
    return NextResponse.json({ lessons });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
