import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { reviewMedicalCertificate } from "@/server/medical-certificates/medical-certificate-service";
import { reviewMedicalCertificateSchema } from "@/server/medical-certificates/schemas";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const { id } = await params;
    const input = reviewMedicalCertificateSchema.parse(await request.json().catch(() => ({})));
    const result = await reviewMedicalCertificate(currentUser.user, id, input);
    return NextResponse.json({ result });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
