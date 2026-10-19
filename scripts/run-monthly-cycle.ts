import "dotenv/config";
import { todayInMoscow } from "../src/server/children/attendance-plan";
import { ensureMonthlySubscriptionsForGroup } from "../src/server/billing/billing-service";
import { getPrisma } from "../src/server/db/prisma";
import { generateLessonsForMonth } from "../src/server/schedule/lesson-service";

const prisma = getPrisma();
const today = todayInMoscow();
const month = today.toISOString().slice(0, 7);
const prepareSchedule = today.getUTCDate() <= 3;
const schools = await prisma.school.findMany({ select: { id: true, name: true } });
let failed = false;

for (const school of schools) {
  const user = await prisma.user.findFirst({
    where: { schoolId: school.id, role: "SUPER_ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, schoolId: true, login: true, displayName: true, role: true }
  });
  if (!user) {
    console.error(`[monthly-cycle] ${school.name}: нет активного администратора`);
    failed = true;
    continue;
  }

  try {
    const billing = prepareSchedule
      ? (await generateLessonsForMonth(user, { month })).billing
      : await ensureMonthlySubscriptionsForGroup(user, month);
    console.log(`[monthly-cycle] ${school.name} ${month}: счетов ${billing?.createdCount ?? 0}, уже были ${billing?.existingCount ?? 0}, без занятий ${billing?.noLessonsCount ?? 0}`);
    for (const issue of billing?.issues ?? []) {
      console.error(`[monthly-cycle] Требует проверки: ${issue.childName}: ${issue.reason}`);
      failed = true;
    }
  } catch (error) {
    console.error(`[monthly-cycle] ${school.name}:`, error);
    failed = true;
  }
}

await prisma.$disconnect();
if (failed) process.exitCode = 1;
