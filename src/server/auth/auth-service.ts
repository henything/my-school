import { getPrisma } from "@/server/db/prisma";
import { legacyPhoneLogin, tryNormalizeParentPhone } from "@/server/parents/phone";
import { verifyPassword } from "./password";

export async function authenticateWithPassword(login: string, password: string) {
  const prisma = getPrisma();
  const trimmedLogin = login.trim();
  const normalizedPhone = tryNormalizeParentPhone(trimmedLogin);
  const loginCandidates = normalizedPhone ? Array.from(new Set([trimmedLogin, normalizedPhone, legacyPhoneLogin(normalizedPhone)])) : [trimmedLogin];

  const user = await prisma.user.findFirst({
    where: {
      login: { in: loginCandidates },
      status: "ACTIVE"
    },
    include: {
      parentAccount: true
    }
  });

  if (!user) {
    return null;
  }

  if (user.role === "PARENT" && user.parentAccount?.status !== "ACTIVE") {
    return null;
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);
  if (!passwordMatches) {
    return null;
  }

  return user;
}
