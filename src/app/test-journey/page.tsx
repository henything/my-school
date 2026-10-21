import { notFound } from "next/navigation";
import { testBookableLessons } from "@/server/trials/fdoc-full-cycle-test";
import { TestJourneyClient } from "./test-journey-client";
import { getCurrentUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function TestJourneyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  let lessons;
  try { lessons = await testBookableLessons(); } catch { notFound(); }
  const { token = "" } = await searchParams;
  const user = await getCurrentUser();
  return <TestJourneyClient lessons={lessons} token={token} existingParent={user?.role === "PARENT"} staffSession={Boolean(user && user.role !== "PARENT")} />;
}
