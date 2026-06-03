import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return url;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: databaseUrl() });
  return new PrismaClient({ adapter });
}

export function getPrisma() {
  if (process.env.NODE_ENV === "production") {
    return createPrismaClient();
  }

  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
