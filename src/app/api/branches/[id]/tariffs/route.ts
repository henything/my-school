import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/api-user";
import { errorMessage, jsonError } from "@/lib/http";
import { listBranchTariffs, saveBranchTariff } from "@/server/billing/branch-tariff-service";
import { branchTariffInputSchema, PricingConflict, TariffNotFound } from "@/server/billing/branch-tariff-rules";

type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  return jsonError(errorMessage(error), error instanceof TariffNotFound ? 404 : error instanceof PricingConflict ? 409 : 400);
}
export async function GET(request: Request, context: Context) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return NextResponse.json(await listBranchTariffs(auth.user, id));
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  try {
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return NextResponse.json({ tariff: await saveBranchTariff(auth.user, id, branchTariffInputSchema.parse(await request.json())) });
  } catch (error) { return failure(error); }
}
