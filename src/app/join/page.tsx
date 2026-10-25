import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { productionBookingGroups } from "@/server/trials/fdoc-full-cycle-test";
import { TestJourneyClient } from "@/app/test-journey/test-journey-client";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  let groups;
  try { groups = await productionBookingGroups(); } catch { notFound(); }
  const { token = "" } = await searchParams;
  const user = await getCurrentUser();
  const account = user?.role === "PARENT" ? await getPrisma().parentAccount.findFirst({
    where: { schoolId: user.schoolId, userId: user.id, status: "ACTIVE" },
    select: { parent: { select: { fullName: true, phone: true, vkProfileUrl: true } } }
  }) : null;
  return <TestJourneyClient groups={groups} token={token} parent={account?.parent ?? null} staffSession={Boolean(user && user.role !== "PARENT")} mode="PRODUCTION" />;
}
