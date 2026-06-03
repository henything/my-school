import { getPrisma } from "@/server/db/prisma";
import { verifyPassword } from "./password";

export async function authenticateWithPassword(login: string, password: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: {
      login,
      status: "ACTIVE"
    }
  });

  if (!user) {
    return null;
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);
  if (!passwordMatches) {
    return null;
  }

  return user;
}
