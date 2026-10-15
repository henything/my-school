import "dotenv/config";
import { hashPassword } from "../src/server/auth/password";
import { getPrisma } from "../src/server/db/prisma";

const password = process.env.STAGING_ADMIN_PASSWORD;
if (!password || password.length < 20) {
  throw new Error("STAGING_ADMIN_PASSWORD must contain at least 20 characters.");
}

const prisma = getPrisma();
try {
  const school = await prisma.school.upsert({
    where: { slug: "azbuka-staging" },
    create: { slug: "azbuka-staging", name: "Азбука движения — тест" },
    update: {}
  });
  const existing = await prisma.user.findUnique({
    where: { schoolId_login: { schoolId: school.id, login: "stage-admin" } },
    select: { id: true }
  });
  if (existing) {
    throw new Error("Staging admin already exists but initial login record is missing.");
  } else {
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        login: "stage-admin",
        passwordHash: await hashPassword(password),
        displayName: "Администратор тестового контура",
        role: "SUPER_ADMIN",
        status: "ACTIVE"
      }
    });
    await prisma.adminProfile.create({ data: { schoolId: school.id, userId: user.id } });
    console.log("Created staging admin.");
  }
} finally {
  await prisma.$disconnect();
}
