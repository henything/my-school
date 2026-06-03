import type { UserRole } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { getPrisma } from "@/server/db/prisma";
import { canCreateUser } from "@/server/rbac/rbac";
import type { CreateUserInput } from "./schemas";

export function serializeUser(user: {
  id: string;
  login: string;
  displayName: string;
  role: UserRole;
  status: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString()
  };
}

export async function listUsers(currentUser: CurrentUser) {
  const users = await getPrisma().user.findMany({
    where: { schoolId: currentUser.schoolId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });

  return users.map(serializeUser);
}

export async function createUser(currentUser: CurrentUser, input: CreateUserInput) {
  if (!canCreateUser(currentUser)) {
    throw new Error("Only SUPER_ADMIN can create users.");
  }

  const prisma = getPrisma();
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId: currentUser.schoolId,
        login: input.login,
        displayName: input.displayName,
        passwordHash,
        role: input.role
      }
    });

    if (input.role === "ADMIN") {
      await tx.adminProfile.create({
        data: {
          schoolId: currentUser.schoolId,
          userId: user.id
        }
      });
    }

    if (input.role === "COACH") {
      await tx.coachProfile.create({
        data: {
          schoolId: currentUser.schoolId,
          userId: user.id
        }
      });
    }

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        newValue: {
          login: user.login,
          displayName: user.displayName,
          role: user.role,
          status: user.status
        }
      },
      tx
    );

    return serializeUser(user);
  });
}

export async function updateUserStatus(currentUser: CurrentUser, userId: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  if (!canCreateUser(currentUser)) {
    throw new Error("Only SUPER_ADMIN can update users.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirstOrThrow({
      where: {
        id: userId,
        schoolId: currentUser.schoolId
      }
    });

    const updated = await tx.user.update({
      where: { id: existing.id },
      data: { status }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "USER_STATUS_UPDATED",
        entityType: "User",
        entityId: updated.id,
        oldValue: { status: existing.status },
        newValue: { status: updated.status }
      },
      tx
    );

    return serializeUser(updated);
  });
}
