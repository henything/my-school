import "dotenv/config";
import { getPrisma } from "../src/server/db/prisma";
import { activatePaidProductionJourney, finalizeSignedTestJourneyByTrialId } from "../src/server/trials/fdoc-full-cycle-test";
import { syncTrialSigningByPackageId } from "../src/server/trials/trial-signing-service";

if (process.env.FDOC_PROD_ENABLED !== "true") {
  console.log("[fdoc] Рабочий контур выключен; сверка пропущена.");
} else {
  const prisma = getPrisma();
  const journeys = await prisma.trialTestJourney.findMany({
    where: { mode: "PRODUCTION", paidAt: null },
    include: { trial: { include: { signingPackage: true } } },
    orderBy: { createdAt: "asc" }, take: 200
  });
  let errors = 0;
  for (const journey of journeys) {
    try {
      const signing = journey.trial.signingPackage;
      if (signing?.status === "SENT" && Date.now() - signing.createdAt.getTime() > 10 * 60_000) {
        throw new Error("Отправка F.Doc не завершилась; проверьте комплект у поставщика перед повторной отправкой.");
      }
      if (signing?.status === "WAITING") await syncTrialSigningByPackageId(signing.id);
      const latest = await prisma.trialSigningPackage.findUnique({ where: { trialId: journey.trialId }, select: { status: true } });
      if (latest?.status === "SIGNED" && !journey.invoiceId) await finalizeSignedTestJourneyByTrialId(journey.trialId);
      const updated = await prisma.trialTestJourney.findUnique({ where: { id: journey.id }, select: { invoiceId: true } });
      if (updated?.invoiceId) await activatePaidProductionJourney(updated.invoiceId);
      if (journey.processingError) await prisma.trialTestJourney.update({ where: { id: journey.id }, data: { processingError: null } });
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message.slice(0, 500) : "неизвестная ошибка";
      await prisma.trialTestJourney.update({ where: { id: journey.id }, data: { processingError: message } });
      console.error(`[fdoc] Заявка ${journey.id}: ${message}`);
    }
  }
  await prisma.$disconnect();
  console.log(`[fdoc] Проверено заявок: ${journeys.length}; ошибок: ${errors}.`);
  if (errors) process.exitCode = 1;
}
