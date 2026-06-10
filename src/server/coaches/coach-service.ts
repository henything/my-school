import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { getPrisma } from "@/server/db/prisma";
import { canCreateUser } from "@/server/rbac/rbac";
import type { CreateCoachInput, UpdateCoachInput } from "./schemas";

type CoachRecord = {
  id: string;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  user: {
    id: string;
    login: string;
    displayName: string;
    status: string;
    createdAt: Date;
  };
  _count?: {
    groups: number;
  };
};

export function serializeCoach(coach: CoachRecord) {
  return {
    id: coach.id,
    userId: coach.user.id,
    login: coach.user.login,
    displayName: coach.user.displayName,
    status: coach.user.status,
    phone: coach.phone,
    notes: coach.notes,
    groupsCount: coach._count?.groups ?? 0,
    createdAt: coach.createdAt.toISOString()
  };
}

export async function listCoaches(currentUser: CurrentUser) {
  const coaches = await getPrisma().coachProfile.findMany({
    where: {
      schoolId: currentUser.schoolId,
      user: { role: "COACH" }
    },
    include: {
      user: true,
      _count: { select: { groups: true } }
    },
    orderBy: [{ user: { status: "asc" } }, { user: { displayName: "asc" } }]
  });

  return coaches.map(serializeCoach);
}

export async function createCoach(currentUser: CurrentUser, input: CreateCoachInput) {
  if (!canCreateUser(currentUser)) {
    throw new Error("Only SUPER_ADMIN can create coach users.");
  }

  const passwordHash = await hashPassword(input.password);

  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId: currentUser.schoolId,
        login: input.login,
        displayName: input.displayName,
        passwordHash,
        role: "COACH"
      }
    });

    const coach = await tx.coachProfile.create({
      data: {
        schoolId: currentUser.schoolId,
        userId: user.id,
        phone: input.phone,
        notes: input.notes
      },
      include: {
        user: true,
        _count: { select: { groups: true } }
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "COACH_CREATED",
        entityType: "CoachProfile",
        entityId: coach.id,
        newValue: serializeCoach(coach)
      },
      tx
    );

    return serializeCoach(coach);
  });
}

export async function updateCoach(currentUser: CurrentUser, coachId: string, input: UpdateCoachInput) {
  if (input.status && !canCreateUser(currentUser)) {
    throw new Error("Only SUPER_ADMIN can update coach user status.");
  }

  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.coachProfile.findFirstOrThrow({
      where: {
        id: coachId,
        schoolId: currentUser.schoolId,
        user: { role: "COACH" }
      },
      include: { user: true }
    });

    if (input.status) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { status: input.status }
      });
    }

    const coach = await tx.coachProfile.update({
      where: { id: existing.id },
      data: {
        phone: input.phone,
        notes: input.notes
      },
      include: {
        user: true,
        _count: { select: { groups: true } }
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "COACH_UPDATED",
        entityType: "CoachProfile",
        entityId: coach.id,
        oldValue: {
          phone: existing.phone,
          notes: existing.notes,
          status: existing.user.status
        },
        newValue: {
          phone: coach.phone,
          notes: coach.notes,
          status: coach.user.status
        }
      },
      tx
    );

    return serializeCoach(coach);
  });
}
