import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getSignedTrialDocument } from "@/server/trials/trial-signing-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const { id, kind } = await params;
    if (kind !== "contract" && kind !== "consent") return jsonError("Документ не найден.", 404);
    const pdf = await getSignedTrialDocument(user.user, id, kind);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${kind}.pdf"`, "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
