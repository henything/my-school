import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createSubscription, listSubscriptions } from "@/server/billing/billing-service";
import { createSubscriptionSchema } from "@/server/billing/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const subscriptions = await listSubscriptions(currentUser.user);
  return NextResponse.json({ subscriptions });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createSubscriptionSchema.parse(await request.json().catch(() => ({})));
    const subscription = await createSubscription(currentUser.user, input);
    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
