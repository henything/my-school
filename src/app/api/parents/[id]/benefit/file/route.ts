import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/api-user";
import { errorMessage, jsonError } from "@/lib/http";
import { loadBenefitEvidence } from "@/server/parents/benefit-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser(["SUPER_ADMIN", "ADMIN", "PARENT"]);
  if (!current.ok) return jsonError(current.error, current.status);
  try {
    const file = await loadBenefitEvidence(current.user, (await params).id);
    return new NextResponse(Buffer.from(file.content), { headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalFileName)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) { return jsonError(errorMessage(error), 404); }
}
