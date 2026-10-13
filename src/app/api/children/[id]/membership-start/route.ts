import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { updateMembershipStart, updateMembershipStartSchema } from "@/server/children/membership-start";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!currentUser.ok) return jsonError(currentUser.error, currentUser.status);
  try {
    const { id } = await params;
    const input = updateMembershipStartSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ membership: await updateMembershipStart(currentUser.user, id, input) });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
