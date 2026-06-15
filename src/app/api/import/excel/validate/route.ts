import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { validateExcelImportFile } from "@/server/import/excel-import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Загрузите .xlsx файл.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const batch = await validateExcelImportFile(currentUser.user, {
      buffer,
      fileName: file.name
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
