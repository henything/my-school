import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/api-user";
import { errorMessage, jsonError } from "@/lib/http";
import { applyCorrection, correctionHistory, previewCorrection } from "@/server/billing/manual-correction-service";
import { CorrectionConflict, correctionApplySchema, correctionInputSchema } from "@/server/billing/manual-correction-rules";
export async function GET(request: Request) {
  const auth = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try { const childId = z.string().uuid().parse(new URL(request.url).searchParams.get("childId")); return NextResponse.json({ history: await correctionHistory(auth.user, childId) }); }
  catch (error) { return jsonError(errorMessage(error), 400); }
}
export async function POST(request: Request) {
  const auth = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const body = await request.json();
    if (body.action === "preview") return NextResponse.json({ preview: await previewCorrection(auth.user, correctionInputSchema.parse(body.input)) });
    if (body.action !== "apply") throw new Error("Выберите действие.");
    const apply = correctionApplySchema.parse(body);
    return NextResponse.json({ preview: await applyCorrection(auth.user, correctionInputSchema.parse(apply.input), apply.operationId, apply.expectedVersion) });
  } catch (error) { return jsonError(errorMessage(error), error instanceof CorrectionConflict ? 409 : 400); }
}
