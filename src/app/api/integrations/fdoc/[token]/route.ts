import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { syncTrialSigningByPackageId } from "@/server/trials/trial-signing-service";

const payloadSchema = z.object({ packageId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const expected = process.env.FDOC_WEBHOOK_TOKEN;
  const received = (await params).token;
  if (!expected || expected.length < 32 || received.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    const payload = payloadSchema.parse(await request.json());
    // Ignore claimed webhook status. Query F.Doc directly before changing records.
    await syncTrialSigningByPackageId(payload.packageId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
