import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { runAdmissionStatusCheck } from "@/server/billing/billing-service";
import { admissionStatusJobSchema } from "@/server/billing/schemas";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = admissionStatusJobSchema.parse(await request.json().catch(() => ({})));
    const result = await runAdmissionStatusCheck(currentUser.user, input);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
