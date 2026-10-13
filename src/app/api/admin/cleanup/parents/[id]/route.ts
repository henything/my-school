import { NextResponse } from "next/server";
import { z } from "zod";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { archiveParent, getParentCleanupPreview, mergeParents } from "@/server/parents/record-cleanup-service";
import { requiredCommentSchema, uuidSchema } from "@/server/shared/schemas";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), reason: requiredCommentSchema }),
  z.object({ action: z.literal("merge"), targetId: uuidSchema, reason: requiredCommentSchema })
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try { return NextResponse.json({ preview: await getParentCleanupPreview(user.user, (await params).id) }); }
  catch (error) { return jsonError(errorMessage(error), 400); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const input = actionSchema.parse(await request.json().catch(() => ({})));
    const id = (await params).id;
    const result = input.action === "archive" ? await archiveParent(user.user, id, input.reason) : await mergeParents(user.user, id, input.targetId, input.reason);
    return NextResponse.json({ result });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
