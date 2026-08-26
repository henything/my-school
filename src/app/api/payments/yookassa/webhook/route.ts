import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { handleYooKassaWebhook } from "@/server/payments/payment-service";

export async function POST(request: Request) {
  try {
    const result = await handleYooKassaWebhook(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
