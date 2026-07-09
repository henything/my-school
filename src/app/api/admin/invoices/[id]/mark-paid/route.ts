import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { markInvoicePaidManually } from "@/server/billing/billing-service";
import { markInvoicePaidSchema } from "@/server/billing/schemas";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const input = markInvoicePaidSchema.parse(await request.json().catch(() => ({})));
    const invoice = await markInvoicePaidManually(currentUser.user, id, input);
    return NextResponse.json({ invoice });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
