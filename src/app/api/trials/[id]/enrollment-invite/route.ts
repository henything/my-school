import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/api-user";
import { issueEnrollmentInvite } from "@/server/trials/enrollment-invite";
import { errorMessage, jsonError } from "@/lib/http";
import { uuidSchema } from "@/server/shared/schemas";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN", "COACH"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try { return NextResponse.json(await issueEnrollmentInvite(auth.user, uuidSchema.parse((await params).id)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return jsonError(errorMessage(error), 400); }
}
