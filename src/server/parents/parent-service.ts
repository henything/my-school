import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import type { CreateParentInput, UpdateParentInput } from "./schemas";

export function serializeParent(parent: {
  id: string;
  fullName: string | null;
  phone: string | null;
  vkProfileUrl: string | null;
  comment: string | null;
  createdAt: Date;
  _count?: { children: number };
}) {
  return {
    id: parent.id,
    fullName: parent.fullName,
    phone: parent.phone,
    vkProfileUrl: parent.vkProfileUrl,
    comment: parent.comment,
    childrenCount: parent._count?.children ?? 0,
    createdAt: parent.createdAt.toISOString()
  };
}

export async function listParents(currentUser: CurrentUser) {
  const parents = await getPrisma().parent.findMany({
    where: { schoolId: currentUser.schoolId },
    include: { _count: { select: { children: true } } },
    orderBy: [{ fullName: "asc" }, { createdAt: "asc" }]
  });

  return parents.map(serializeParent);
}

export async function createParent(currentUser: CurrentUser, input: CreateParentInput) {
  return getPrisma().$transaction(async (tx) => {
    const parent = await tx.parent.create({
      data: {
        schoolId: currentUser.schoolId,
        fullName: input.fullName,
        phone: input.phone,
        vkProfileUrl: input.vkProfileUrl,
        comment: input.comment
      },
      include: { _count: { select: { children: true } } }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "PARENT_CREATED",
        entityType: "Parent",
        entityId: parent.id,
        newValue: serializeParent(parent)
      },
      tx
    );

    return serializeParent(parent);
  });
}

export async function updateParent(currentUser: CurrentUser, parentId: string, input: UpdateParentInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.parent.findFirstOrThrow({
      where: {
        id: parentId,
        schoolId: currentUser.schoolId
      }
    });

    const parent = await tx.parent.update({
      where: { id: existing.id },
      data: input,
      include: { _count: { select: { children: true } } }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "PARENT_UPDATED",
        entityType: "Parent",
        entityId: parent.id,
        oldValue: {
          fullName: existing.fullName,
          phone: existing.phone,
          vkProfileUrl: existing.vkProfileUrl
        },
        newValue: {
          fullName: parent.fullName,
          phone: parent.phone,
          vkProfileUrl: parent.vkProfileUrl
        }
      },
      tx
    );

    return serializeParent(parent);
  });
}
