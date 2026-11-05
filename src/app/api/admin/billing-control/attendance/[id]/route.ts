import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { resolveBillingSickness } from "@/server/billing/control-service";
import { uuidSchema } from "@/server/shared/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const id = uuidSchema.parse((await params).id);
    return NextResponse.json(await resolveBillingSickness(auth.user, id, await request.json()));
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
