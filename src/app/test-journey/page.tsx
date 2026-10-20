import { notFound } from "next/navigation";
import { testBookableLessons } from "@/server/trials/fdoc-full-cycle-test";
import { TestJourneyClient } from "./test-journey-client";

export const dynamic = "force-dynamic";

export default async function TestJourneyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  let lessons;
  try { lessons = await testBookableLessons(); } catch { notFound(); }
  const { token = "" } = await searchParams;
  return <TestJourneyClient lessons={lessons} token={token} />;
}
