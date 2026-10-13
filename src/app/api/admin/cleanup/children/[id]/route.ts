import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateChild } from "@/server/children/child-service";
import { getChildCleanupPreview } from "@/server/parents/record-cleanup-service";
import { requiredCommentSchema } from "@/server/shared/schemas";

const schema = z.object({ reason: requiredCommentSchema });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try { return NextResponse.json({ preview: await getChildCleanupPreview(user.user, (await params).id) }); }
  catch (error) { return jsonError(errorMessage(error), 400); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const { reason } = schema.parse(await request.json().catch(() => ({})));
    const child = await updateChild(user.user, (await params).id, { status: "ARCHIVED", currentGroupId: null, statusChangeComment: reason });
    return NextResponse.json({ child });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
