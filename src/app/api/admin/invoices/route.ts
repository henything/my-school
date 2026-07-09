import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createInvoiceFromSubscription, listInvoices } from "@/server/billing/billing-service";
import { createInvoiceSchema } from "@/server/billing/schemas";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function GET() {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const invoices = await listInvoices(currentUser.user);
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createInvoiceSchema.parse(await request.json().catch(() => ({})));
    const invoice = await createInvoiceFromSubscription(currentUser.user, input);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
