import { NextResponse } from "next/server";
import { errorMessage, jsonError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/api-user";
import { listAuditLogs } from "@/server/audit/audit-log-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

export async function GET(request: Request) {
  const currentUser = await requireApiUser(ADMIN_ROLES);

  if (!currentUser.ok) {
    return jsonError(currentUser.error, currentUser.status);
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const auditLogs = await listAuditLogs(currentUser.user, Number.isFinite(limit) ? limit : 200);
    return NextResponse.json({ auditLogs });
  } catch (error) {
    return jsonError(errorMessage(error), 400);
  }
}
