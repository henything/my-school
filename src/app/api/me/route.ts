import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getCurrentUser } from "@/server/auth/current-user";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("Требуется вход.", 401);
  }

  return NextResponse.json({ user });
}
