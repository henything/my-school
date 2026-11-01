import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { reviewBenefit, reviewBenefitSchema } from "@/server/parents/benefit-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!current.ok) return jsonError(current.error, current.status);
  try {
    const { id } = await params;
    const input = reviewBenefitSchema.parse(await request.json());
    return NextResponse.json({ benefit: await reviewBenefit(current.user, id, input) });
  } catch (error) { return jsonError(errorMessage(error), 400); }
}
