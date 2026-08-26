import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { generateLessonsForAcademicYear } from "@/server/schedule/lesson-service";
import { generateAcademicYearSchema } from "@/server/schedule/schemas";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = generateAcademicYearSchema.parse(await request.json().catch(() => ({})));
    const result = await generateLessonsForAcademicYear(currentUser.user, input);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
