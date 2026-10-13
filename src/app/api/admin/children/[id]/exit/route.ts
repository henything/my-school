import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getExitSettlement, leaveChild } from "@/server/billing/exit-settlement-service";
import { requiredCommentSchema } from "@/server/shared/schemas";

const leaveSchema = z.object({ reason: requiredCommentSchema });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    return NextResponse.json({ settlement: await getExitSettlement(currentUser.user, id) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const { reason } = leaveSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ settlement: await leaveChild(currentUser.user, id, reason) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
