import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const adapter = new PrismaPg({
  connectionString: requiredEnv("DATABASE_URL")
});

const prisma = new PrismaClient({ adapter });

type SeedUser = {
  login: string;
  password: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "COACH";
};

async function main() {
  const schoolName = process.env.SEED_SCHOOL_NAME ?? "Азбука движения";
  const schoolSlug = process.env.SEED_SCHOOL_SLUG ?? "azbuka-dvizheniya";
  const users: SeedUser[] = [
    {
      login: "Owner",
      password: "OwnerSuperAdmin123!",
      displayName: "Супер-админ",
      role: "SUPER_ADMIN"
    },
    {
      login: "Gimaxon",
      password: "VadimAdmin123!",
      displayName: "Вадим",
      role: "ADMIN"
    },
    {
      login: "Shpak",
      password: "OlegAdmin123!",
      displayName: "Олег",
      role: "ADMIN"
    },
    {
      login: "Trainer",
      password: "TrainerCoach123!",
      displayName: "Тренер",
      role: "COACH"
    }
  ];

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

  for (const seedUser of users) {
    await upsertSeedUser(school.id, seedUser);
  }

  console.info(`Seeded school "${school.name}" and ${users.length} users.`);
}

async function upsertSeedUser(schoolId: string, seedUser: SeedUser) {
  const passwordHash = await hashPassword(seedUser.password);

  const user = await prisma.user.upsert({
    where: {
      schoolId_login: {
        schoolId,
        login: seedUser.login
      }
    },
    update: {
      passwordHash,
      displayName: seedUser.displayName,
      role: seedUser.role,
      status: "ACTIVE"
    },
    create: {
      schoolId,
      login: seedUser.login,
      passwordHash,
      displayName: seedUser.displayName,
      role: seedUser.role,
      status: "ACTIVE"
    }
  });

  if (seedUser.role === "SUPER_ADMIN" || seedUser.role === "ADMIN") {
    await prisma.adminProfile.upsert({
      where: { userId: user.id },
      update: { schoolId },
      create: {
        schoolId,
        userId: user.id
      }
    });
  }

  if (seedUser.role === "COACH") {
    await prisma.coachProfile.upsert({
      where: { userId: user.id },
      update: {
        schoolId
      },
      create: {
        schoolId,
        userId: user.id
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      schoolId,
      actorUserId: user.id,
      action: "SEED_USER_UPSERTED",
      entityType: "User",
      entityId: user.id,
      newValue: {
        login: user.login,
        role: user.role,
        status: user.status
      }
    }
  });
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
