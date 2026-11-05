import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/api-user";
import { getBillingControl } from "@/server/billing/control-service";

export async function GET() {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(await getBillingControl(auth.user));
}
