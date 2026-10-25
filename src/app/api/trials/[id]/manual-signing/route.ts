import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { verifyManualTrialSigning } from "@/server/trials/trial-signing-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const data = await request.formData();
    const contract = data.get("contract");
    const consent = data.get("consent");
    const comment = data.get("comment");
    if (!(contract instanceof File) || !(consent instanceof File) || typeof comment !== "string") {
      return jsonError("Приложите оба PDF и укажите основание проверки.", 400);
    }
    return NextResponse.json(await verifyManualTrialSigning(user.user, (await params).id, contract, consent, comment));
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
