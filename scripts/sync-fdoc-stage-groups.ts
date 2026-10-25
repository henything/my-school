import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getPrisma } from "../src/server/db/prisma";

if (process.env.FDOC_FULL_CYCLE_TEST_ENABLED !== "true" || !process.env.DATABASE_URL?.includes("azbuka_stage")) {
  throw new Error("Синхронизация групп разрешена только в изолированной базе azbuka_stage.");
}

const groupSchema = z.array(z.object({
  name: z.string().min(1), address: z.string().nullable(), branch: z.string().min(1),
  branchAddress: z.string().nullable(), capacityLimit: z.number().int().positive(),
  schedule: z.array(z.object({ weekday: z.number().int().min(1).max(7), startTime: z.string(), endTime: z.string() }))
}));
const source = process.argv[2];
if (!source) throw new Error("Укажите JSON-файл со справочником групп и расписанием.");
const groups = groupSchema.parse(JSON.parse(await readFile(source, "utf8")));
const prisma = getPrisma();
const schoolId = process.env.FDOC_TEST_SCHOOL_ID!;
const testGroup = await prisma.trainingGroup.findFirstOrThrow({
  where: { schoolId, name: "Группа F.Doc ТЕСТ" }, select: { mainCoachId: true }
});
let lessonsCreated = 0;
for (const entry of groups) {
  const branch = await prisma.branch.upsert({
    where: { schoolId_name: { schoolId, name: entry.branch } },
    create: { schoolId, name: entry.branch, address: entry.branchAddress },
    update: { address: entry.branchAddress, status: "ACTIVE" }
  });
  const group = await prisma.trainingGroup.upsert({
    where: { branchId_name: { branchId: branch.id, name: entry.name } },
    create: { schoolId, branchId: branch.id, mainCoachId: testGroup.mainCoachId,
      name: entry.name, address: entry.address, capacityLimit: entry.capacityLimit },
    update: { address: entry.address, capacityLimit: entry.capacityLimit, status: "ACTIVE" }
  });
  for (const slot of entry.schedule) {
    const template = await prisma.scheduleTemplate.upsert({
      where: { groupId_weekday_startTime: { groupId: group.id, weekday: slot.weekday, startTime: slot.startTime } },
      create: { schoolId, groupId: group.id, branchId: branch.id, coachId: testGroup.mainCoachId,
        weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime },
      update: { endTime: slot.endTime, status: "ACTIVE" }
    });
    for (let timestamp = Date.UTC(2026, 9, 22); timestamp <= Date.UTC(2026, 10, 30); timestamp += 86400000) {
      const date = new Date(timestamp);
      if ((date.getUTCDay() || 7) !== slot.weekday) continue;
      const existing = await prisma.lesson.findUnique({
        where: { groupId_lessonDate_startTime: { groupId: group.id, lessonDate: date, startTime: slot.startTime } },
        select: { id: true }
      });
      if (existing) continue;
      await prisma.lesson.create({ data: {
        schoolId, groupId: group.id, branchId: branch.id, coachId: testGroup.mainCoachId,
        scheduleTemplateId: template.id, lessonDate: date, startTime: slot.startTime, endTime: slot.endTime
      } });
      lessonsCreated++;
    }
  }
}
console.log(`F.Doc DEMO: групп ${groups.length}, добавлено занятий ${lessonsCreated}.`);
await prisma.$disconnect();
