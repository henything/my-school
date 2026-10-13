import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getExitSettlement, leaveChild } from "@/server/billing/exit-settlement-service";
import { requiredCommentSchema } from "@/server/shared/schemas";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
const leaveSchema = z.object({ reason: requiredCommentSchema, lastDate: dateSchema, expectedRevision: z.string().length(64) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const rawDate = new URL(request.url).searchParams.get("lastDate");
    return NextResponse.json({ settlement: await getExitSettlement(currentUser.user, id, rawDate ? dateSchema.parse(rawDate) : undefined) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const { reason, lastDate, expectedRevision } = leaveSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ settlement: await leaveChild(currentUser.user, id, reason, lastDate, expectedRevision) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
