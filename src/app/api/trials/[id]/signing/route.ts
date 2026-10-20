import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { startTrialSigning, syncTrialSigning } from "@/server/trials/trial-signing-service";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH", "PARENT"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const signing = await startTrialSigning(user.user, (await params).id);
    return NextResponse.json({ signing });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function PUT(_request: Request, { params }: Context) {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN", "COACH", "PARENT"]);
  if (!user.ok) return jsonError(user.error, user.status);
  try {
    const signing = await syncTrialSigning(user.user, (await params).id);
    return NextResponse.json({ signing });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
