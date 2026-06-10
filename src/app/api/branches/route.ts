import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createBranch, listBranches } from "@/server/branches/branch-service";
import { createBranchSchema } from "@/server/branches/schemas";

export async function GET() {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  const branches = await listBranches(currentUser.user);
  return NextResponse.json({ branches });
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = createBranchSchema.parse(await request.json().catch(() => ({})));
    const branch = await createBranch(currentUser.user, input);
    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("Unique constraint") ? 409 : 400;
    return jsonError(status === 409 ? "Филиал с таким названием уже существует." : message, status);
  }
}
