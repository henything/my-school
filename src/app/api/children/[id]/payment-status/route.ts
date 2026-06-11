import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateChildPaymentStatus } from "@/server/billing/billing-service";
import { updatePaymentStatusSchema } from "@/server/billing/schemas";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = updatePaymentStatusSchema.parse(await request.json().catch(() => ({})));
    const subscription = await updateChildPaymentStatus(currentUser.user, id, input);
    return NextResponse.json({ subscription });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
