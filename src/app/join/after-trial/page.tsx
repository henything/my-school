import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { previewEnrollmentInvite } from "@/server/trials/enrollment-invite";
import { TestJourneyClient } from "@/app/test-journey/test-journey-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Продолжить после пробного — Азбука движения", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function AfterTrialPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite = "" } = await searchParams;
  const user = await getCurrentUser();
  let preview;
  try { preview = await previewEnrollmentInvite(invite, user); }
  catch (error) { return <main className="mx-auto max-w-xl px-4 py-12"><div className="panel p-6"><h1 className="text-xl font-bold">Не удалось открыть регистрацию</h1><p className="mt-3" role="alert">{error instanceof Error ? error.message : "Попросите сотрудника прислать новую ссылку."}</p></div></main>; }
  if (preview.claimed) {
    if (preview.journeyId) redirect(`${preview.mode === "TEST" ? "/test-journey" : "/join"}?token=${preview.journeyId}`);
    return <main className="mx-auto max-w-xl px-4 py-12"><div className="panel p-6"><h1 className="text-xl font-bold">Регистрация по этой ссылке уже завершена</h1><p className="mt-3">Войдите в кабинет родителя, который заполнил анкету, затем снова откройте эту ссылку.</p><a className="mt-4 inline-block underline" href="/login">Войти в кабинет</a></div></main>;
  }
  const account = user?.role === "PARENT" ? await getPrisma().parentAccount.findFirst({ where: { schoolId: user.schoolId, userId: user.id, status: "ACTIVE" }, select: { parent: { select: { fullName: true, phone: true, vkProfileUrl: true, benefitCategory: true, benefitStatus: true, benefitEvidenceId: true } } } }) : null;
  return <TestJourneyClient groups={[]} token="" parent={account?.parent ?? null} staffSession={Boolean(user && user.role !== "PARENT")} mode={preview.mode} invitation={{ token: invite, ...preview }} />;
}
