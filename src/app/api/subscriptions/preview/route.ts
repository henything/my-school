import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/api-user";
import { errorMessage, jsonError } from "@/lib/http";
import { previewSubscription } from "@/server/billing/billing-service";
import { createSubscriptionSchema } from "@/server/billing/schemas";
export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    return NextResponse.json({ preview: await previewSubscription(auth.user, createSubscriptionSchema.parse(await request.json())) });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
