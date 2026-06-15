import { z } from "zod";
import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { confirmExcelImport } from "@/server/import/excel-import-service";

export const runtime = "nodejs";

const confirmExcelImportSchema = z.object({
  batchId: z.string().uuid("Invalid batch id.")
});

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const input = confirmExcelImportSchema.parse(await request.json().catch(() => ({})));
    const result = await confirmExcelImport(currentUser.user, input.batchId);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
