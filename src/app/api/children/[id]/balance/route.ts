import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { getChildBalance } from "@/server/billing/billing-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const balance = await getChildBalance(currentUser.user, id);
    return NextResponse.json({ balance });
  } catch (error) {
    const message = errorMessage(error);
    return jsonError(message.includes("No Child found") ? "Ребёнок не найден." : message, message.includes("No Child found") ? 404 : 400);
  }
}
