import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";
import { createSessionToken, hashSessionToken } from "@/server/auth/session-token";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, hasRole } from "@/server/rbac/rbac";
import { normalizeParentPhone } from "./phone";
import type { ActivateParentInviteInput, ConfirmParentPasswordResetInput, CreateParentInviteInput } from "./schemas";

const PARENT_INVITE_TTL_DAYS = 7;
const PASSWORD_RESET_TTL_MINUTES = 60;

const parentAccountInclude = {
  parent: { select: { id: true, fullName: true, phone: true, vkProfileUrl: true, _count: { select: { children: true } } } },
  user: { select: { id: true, login: true, displayName: true, status: true, role: true } }
} as const;

type ParentAccountRecord = Prisma.ParentAccountGetPayload<{ include: typeof parentAccountInclude }>;

export function serializeParentAccount(account: ParentAccountRecord) {
  return {
    id: account.id,
    status: account.status,
    activatedAt: account.activatedAt?.toISOString() ?? null,
    blockedAt: account.blockedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    user: account.user,
    parent: {
      id: account.parent.id,
      fullName: account.parent.fullName,
      phone: account.parent.phone,
      vkProfileUrl: account.parent.vkProfileUrl,
      childrenCount: account.parent._count.children
    }
  };
}

export async function listParentAccounts(currentUser: CurrentUser) {
  assertAdmin(currentUser);

  const accounts = await getPrisma().parentAccount.findMany({
    where: { schoolId: currentUser.schoolId },
    include: parentAccountInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return accounts.map(serializeParentAccount);
}

export async function createParentInvite(currentUser: CurrentUser, input: CreateParentInviteInput) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const parent = await tx.parent.findFirstOrThrow({
      where: {
        id: input.parentId,
        schoolId: currentUser.schoolId
      },
      include: {
        account: { include: { user: true } },
        _count: { select: { children: true } }
      }
    });

    if (parent._count.children === 0) {
      throw new Error("Нельзя создать родительский вход: родитель не привязан ни к одному ребёнку.");
    }

    if (parent.account?.status === "ACTIVE") {
      throw new Error("Родительский кабинет уже активирован.");
    }

    if (parent.account?.status === "BLOCKED") {
      throw new Error("Родительский кабинет заблокирован.");
    }

    const normalizedPhone = normalizeParentPhone(parent.phone);
    await ensurePhoneLoginAvailable(tx, currentUser.schoolId, normalizedPhone, parent.id);

    await tx.parentInvite.updateMany({
      where: {
        schoolId: currentUser.schoolId,
        parentId: parent.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { usedAt: new Date() }
    });

    const token = createSessionToken();
    const invite = await tx.parentInvite.create({
      data: {
        schoolId: currentUser.schoolId,
        parentId: parent.id,
        tokenHash: hashSessionToken(token),
        expiresAt: addDays(new Date(), PARENT_INVITE_TTL_DAYS),
        createdByUserId: currentUser.id
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "PARENT_INVITE_CREATED",
        entityType: "Parent",
        entityId: parent.id,
        newValue: {
          parentId: parent.id,
          login: normalizedPhone,
          expiresAt: invite.expiresAt.toISOString()
        }
      },
      tx
    );

    return {
      token,
      expiresAt: invite.expiresAt.toISOString(),
      parentId: parent.id,
      parentName: parent.fullName,
      login: normalizedPhone
    };
  });
}

export async function activateParentInvite(input: ActivateParentInviteInput) {
  const tokenHash = hashSessionToken(input.token);
  const passwordHash = await hashPassword(input.password);

  return getPrisma().$transaction(async (tx) => {
    const invite = await tx.parentInvite.findUnique({
      where: { tokenHash },
      include: {
        parent: {
          include: {
            account: { include: { user: true } },
            _count: { select: { children: true } }
          }
        }
      }
    });

    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      throw new Error("Ссылка активации недействительна или истекла.");
    }

    if (invite.parent._count.children === 0) {
      throw new Error("Родитель не привязан ни к одному ребёнку.");
    }

    if (invite.parent.account?.status === "BLOCKED") {
      throw new Error("Родительский кабинет заблокирован.");
    }

    const normalizedPhone = normalizeParentPhone(invite.parent.phone);
    await ensurePhoneLoginAvailable(tx, invite.schoolId, normalizedPhone, invite.parentId);

    const existingUser = await tx.user.findFirst({
      where: {
        schoolId: invite.schoolId,
        login: normalizedPhone
      }
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          schoolId: invite.schoolId,
          login: normalizedPhone,
          passwordHash,
          role: "PARENT",
          status: "ACTIVE",
          displayName: invite.parent.fullName ?? normalizedPhone
        }
      }));

    if (user.role !== "PARENT") {
      throw new Error("Этот телефон уже используется другим пользователем.");
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        displayName: invite.parent.fullName ?? user.displayName
      }
    });

    const account = invite.parent.account
      ? await tx.parentAccount.update({
          where: { id: invite.parent.account.id },
          data: {
            userId: user.id,
            status: "ACTIVE",
            activatedAt: new Date(),
            blockedAt: null
          },
          include: parentAccountInclude
        })
      : await tx.parentAccount.create({
          data: {
            schoolId: invite.schoolId,
            userId: user.id,
            parentId: invite.parentId,
            status: "ACTIVE",
            activatedAt: new Date()
          },
          include: parentAccountInclude
        });

    await tx.parentInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() }
    });

    await writeAuditLog(
      {
        schoolId: invite.schoolId,
        actorUserId: user.id,
        action: "PARENT_ACCOUNT_ACTIVATED",
        entityType: "ParentAccount",
        entityId: account.id,
        newValue: {
          parentId: invite.parentId,
          userId: user.id,
          login: normalizedPhone
        }
      },
      tx
    );

    return user;
  });
}

export async function createParentPasswordReset(currentUser: CurrentUser, parentAccountId: string) {
  assertAdmin(currentUser);

  return getPrisma().$transaction(async (tx) => {
    const account = await tx.parentAccount.findFirstOrThrow({
      where: {
        id: parentAccountId,
        schoolId: currentUser.schoolId
      },
      include: parentAccountInclude
    });

    if (account.status !== "ACTIVE") {
      throw new Error("Сброс пароля доступен только для активного родительского кабинета.");
    }

    await tx.passwordResetToken.updateMany({
      where: {
        schoolId: currentUser.schoolId,
        userId: account.userId,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { usedAt: new Date() }
    });

    const token = createSessionToken();
    const reset = await tx.passwordResetToken.create({
      data: {
        schoolId: currentUser.schoolId,
        userId: account.userId,
        tokenHash: hashSessionToken(token),
        expiresAt: addMinutes(new Date(), PASSWORD_RESET_TTL_MINUTES),
        createdByUserId: currentUser.id
      }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "PARENT_PASSWORD_RESET_CREATED",
        entityType: "ParentAccount",
        entityId: account.id,
        newValue: {
          parentId: account.parentId,
          userId: account.userId,
          expiresAt: reset.expiresAt.toISOString()
        }
      },
      tx
    );

    return {
      token,
      expiresAt: reset.expiresAt.toISOString(),
      parentAccountId: account.id,
      parentName: account.parent.fullName,
      login: account.user.login
    };
  });
}

export async function confirmParentPasswordReset(input: ConfirmParentPasswordResetInput) {
  const tokenHash = hashSessionToken(input.token);
  const passwordHash = await hashPassword(input.password);

  return getPrisma().$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            parentAccount: true
          }
        }
      }
    });

    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new Error("Ссылка восстановления недействительна или истекла.");
    }

    if (reset.user.role !== "PARENT" || reset.user.parentAccount?.status !== "ACTIVE") {
      throw new Error("Восстановление доступно только активному родительскому кабинету.");
    }

    const user = await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash }
    });

    await tx.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() }
    });

    await tx.session.deleteMany({
      where: { userId: user.id }
    });

    await writeAuditLog(
      {
        schoolId: reset.schoolId,
        actorUserId: user.id,
        action: "PARENT_PASSWORD_RESET_CONFIRMED",
        entityType: "User",
        entityId: user.id
      },
      tx
    );

    return user;
  });
}

export async function getActiveParentAccount(currentUser: CurrentUser) {
  if (currentUser.role !== "PARENT") {
    throw new Error("Доступно только родителю.");
  }

  const account = await getPrisma().parentAccount.findFirstOrThrow({
    where: {
      schoolId: currentUser.schoolId,
      userId: currentUser.id,
      status: "ACTIVE"
    },
    include: parentAccountInclude
  });

  return account;
}

async function ensurePhoneLoginAvailable(tx: Prisma.TransactionClient, schoolId: string, normalizedPhone: string, parentId: string) {
  const existing = await tx.user.findFirst({
    where: {
      schoolId,
      login: normalizedPhone
    },
    include: {
      parentAccount: true
    }
  });

  if (!existing) {
    return;
  }

  const sameParentAccount = existing.role === "PARENT" && existing.parentAccount?.parentId === parentId;

  if (!sameParentAccount) {
    throw new Error("Нельзя создать родительский вход: этот телефон уже используется другим родителем.");
  }
}

function assertAdmin(currentUser: CurrentUser) {
  if (!hasRole(currentUser, ADMIN_ROLES)) {
    throw new Error("Доступно только администратору.");
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}
