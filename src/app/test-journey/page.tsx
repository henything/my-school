import { notFound } from "next/navigation";
import { testBookingGroups } from "@/server/trials/fdoc-full-cycle-test";
import { TestJourneyClient } from "./test-journey-client";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export default async function TestJourneyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  let groups;
  try { groups = await testBookingGroups(); } catch { notFound(); }
  const { token = "" } = await searchParams;
  const user = await getCurrentUser();
  const parent = user?.role === "PARENT" ? await getPrisma().parentAccount.findFirst({
    where: { schoolId: user.schoolId, userId: user.id, status: "ACTIVE" },
    select: { parent: { select: { fullName: true, phone: true, vkProfileUrl: true } } }
  }) : null;
  return <TestJourneyClient groups={groups} token={token} parent={parent?.parent ?? null} staffSession={Boolean(user && user.role !== "PARENT")} />;
}
