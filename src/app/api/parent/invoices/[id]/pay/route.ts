import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { publicOriginFromRequest } from "@/lib/url";
import { requireApiUser } from "@/server/auth/api-user";
import { createParentInvoicePayment, InvoicePaymentConflict } from "@/server/payments/payment-service";

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
    const input = z.object({ expectedAmountKopeks: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).safeParse(await request.json().catch(() => null));
    if (!input.success) return jsonError("Данные счёта устарели. Обновите страницу и проверьте сумму перед оплатой.", 409);
    const payment = await createParentInvoicePayment(currentUser.user, id, input.data.expectedAmountKopeks, publicOriginFromRequest(request));
    return NextResponse.json(payment);
  } catch (error) {
    return jsonError(errorMessage(error), error instanceof InvoicePaymentConflict ? 409 : 400);
  }
}
