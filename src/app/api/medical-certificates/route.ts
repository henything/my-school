import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { createMedicalCertificate, listMedicalCertificates } from "@/server/medical-certificates/medical-certificate-service";
import { createMedicalCertificateSchema } from "@/server/medical-certificates/schemas";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function GET() {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const certificates = await listMedicalCertificates(currentUser.user);
    return NextResponse.json({ certificates });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}

export async function POST(request: Request) {
  const currentUser = await requireApiUser(["SUPER_ADMIN", "ADMIN", "PARENT"]);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const formData = await request.formData();
    const input = createMedicalCertificateSchema.parse({
      childId: formData.get("childId"),
      attendanceRecordId: formData.get("attendanceRecordId") || null,
      periodStart: formData.get("periodStart"),
      periodEnd: formData.get("periodEnd"),
      comment: formData.get("comment")
    });
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Прикрепите файл справки.", 400);
    }

    const certificate = await createMedicalCertificate(currentUser.user, input, file);
    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
