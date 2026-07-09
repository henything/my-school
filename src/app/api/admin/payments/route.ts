import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { listPayments } from "@/server/billing/billing-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function GET() {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const payments = await listPayments(currentUser.user);
  return NextResponse.json({ payments });
}
