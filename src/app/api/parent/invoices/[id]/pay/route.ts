import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
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
    const payment = await createParentInvoicePayment(currentUser.user, id, originFromRequest(request));
    return NextResponse.json(payment);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

function originFromRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host")) ?? request.headers.get("host") ?? requestUrl.host;
  const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? requestUrl.protocol.replace(":", "");

  return `${proto}://${host}`;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}
