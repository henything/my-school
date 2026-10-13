import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { applyRecalculation, getRecalculationPreview } from "@/server/billing/recalculation-service";
import { requiredCommentSchema } from "@/server/shared/schemas";

const applySchema = z.object({
  reason: requiredCommentSchema,
  paidDifferenceAction: z.enum(["CREDIT", "REFUND_DUE"]).optional(),
  expectedSubscriptionUpdatedAt: z.string().datetime(),
  expectedInvoiceUpdatedAt: z.string().datetime(),
  expectedLessonIds: z.array(z.string().uuid())
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    return NextResponse.json({ preview: await getRecalculationPreview(currentUser.user, id) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const input = applySchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ preview: await applyRecalculation(currentUser.user, id, input) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
