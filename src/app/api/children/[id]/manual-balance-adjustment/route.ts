import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createManualBalanceAdjustment } from "@/server/billing/billing-service";
import { manualBalanceAdjustmentSchema } from "@/server/billing/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = manualBalanceAdjustmentSchema.parse(await request.json().catch(() => ({})));
    const transaction = await createManualBalanceAdjustment(currentUser.user, id, input);
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
