import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const adapter = new PrismaPg({
  connectionString: requiredEnv("DATABASE_URL")
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const schoolName = process.env.SEED_SCHOOL_NAME ?? "Азбука движения";
  const schoolSlug = process.env.SEED_SCHOOL_SLUG ?? "azbuka-dvizheniya";
  const login = process.env.SEED_SUPER_ADMIN_LOGIN ?? "superadmin";
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
  const displayName = process.env.SEED_SUPER_ADMIN_NAME ?? "Владелец продукта";

  const school = await prisma.school.upsert({
    where: { slug: schoolSlug },
    update: {
      name: schoolName
    },
    create: {
      name: schoolName,
      slug: schoolSlug
    }
  });

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: {
      schoolId_login: {
        schoolId: school.id,
        login
      }
    },
    update: {
      passwordHash,
      displayName,
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    },
    create: {
      schoolId: school.id,
      login,
      passwordHash,
      displayName,
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  await prisma.auditLog.create({
    data: {
      schoolId: school.id,
      actorUserId: user.id,
      action: "SEED_SUPER_ADMIN_UPSERTED",
      entityType: "User",
      entityId: user.id,
      newValue: {
        login: user.login,
        role: user.role,
        status: user.status
      }
    }
  });

  console.info(`Seeded school "${school.name}" and SUPER_ADMIN "${user.login}".`);
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
