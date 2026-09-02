import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { publicOriginFromRequest } from "@/lib/url";
import { requireApiUser } from "@/server/auth/api-user";
import { createParentInvoicePayment } from "@/server/payments/payment-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["PARENT"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const payment = await createParentInvoicePayment(currentUser.user, id, publicOriginFromRequest(request));
    return NextResponse.json(payment);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
