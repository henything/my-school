import "dotenv/config";
import { getPrisma } from "../src/server/db/prisma";

if (process.env.FDOC_FULL_CYCLE_TEST_ENABLED !== "true" || !process.env.DATABASE_URL?.includes("azbuka_stage")) {
  throw new Error("Этот скрипт разрешён только в изолированной базе azbuka_stage.");
}

const prisma = getPrisma();
const group = await prisma.trainingGroup.findFirstOrThrow({
  where: { name: "Группа F.Doc ТЕСТ", schoolId: process.env.FDOC_TEST_SCHOOL_ID },
  select: { id: true, schoolId: true, branchId: true, mainCoachId: true }
});
let created = 0;
for (const weekday of [1, 4]) {
  const template = await prisma.scheduleTemplate.upsert({
    where: { groupId_weekday_startTime: { groupId: group.id, weekday, startTime: "20:00" } },
    create: {
      schoolId: group.schoolId, groupId: group.id, branchId: group.branchId,
      coachId: group.mainCoachId, weekday, startTime: "20:00", endTime: "20:45"
    },
    update: { status: "ACTIVE" }
  });
  for (let timestamp = Date.UTC(2026, 9, 22); timestamp <= Date.UTC(2026, 10, 30); timestamp += 86400000) {
    const date = new Date(timestamp);
    if ((date.getUTCDay() || 7) !== weekday) continue;
    const existing = await prisma.lesson.findUnique({
      where: { groupId_lessonDate_startTime: { groupId: group.id, lessonDate: date, startTime: "20:00" } },
      select: { id: true }
    });
    if (existing) continue;
    await prisma.lesson.create({ data: {
      schoolId: group.schoolId, groupId: group.id, branchId: group.branchId,
      coachId: group.mainCoachId, scheduleTemplateId: template.id,
      lessonDate: date, startTime: "20:00", endTime: "20:45"
    } });
    created++;
  }
}
console.log(`График F.Doc DEMO: добавлено занятий ${created}.`);
await prisma.$disconnect();
