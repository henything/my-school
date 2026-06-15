import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { listExcelImportErrors } from "@/server/import/excel-import-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await context.params;
    const errors = await listExcelImportErrors(currentUser.user, id);
    return NextResponse.json({ errors });
  } catch (error) {
    const message = errorMessage(error);
    return jsonError(message, message.includes("не найден") ? 404 : 400);
  }
}
