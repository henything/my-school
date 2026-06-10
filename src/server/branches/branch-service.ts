import { writeAuditLog } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import type { CreateBranchInput, UpdateBranchInput } from "./schemas";

export function serializeBranch(branch: {
  id: string;
  name: string;
  address: string | null;
  status: string;
  inventoryNotes: string | null;
  comment: string | null;
  createdAt: Date;
  _count?: { groups: number };
}) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    status: branch.status,
    inventoryNotes: branch.inventoryNotes,
    comment: branch.comment,
    groupsCount: branch._count?.groups ?? 0,
    createdAt: branch.createdAt.toISOString()
  };
}

export async function listBranches(currentUser: CurrentUser) {
  const branches = await getPrisma().branch.findMany({
    where: { schoolId: currentUser.schoolId },
    include: { _count: { select: { groups: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }]
  });

  return branches.map(serializeBranch);
}

export async function createBranch(currentUser: CurrentUser, input: CreateBranchInput) {
  return getPrisma().$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        schoolId: currentUser.schoolId,
        name: input.name,
        address: input.address,
        inventoryNotes: input.inventoryNotes,
        comment: input.comment
      },
      include: { _count: { select: { groups: true } } }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "BRANCH_CREATED",
        entityType: "Branch",
        entityId: branch.id,
        newValue: serializeBranch(branch)
      },
      tx
    );

    return serializeBranch(branch);
  });
}

export async function updateBranch(currentUser: CurrentUser, branchId: string, input: UpdateBranchInput) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.branch.findFirstOrThrow({
      where: {
        id: branchId,
        schoolId: currentUser.schoolId
      }
    });

    const branch = await tx.branch.update({
      where: { id: existing.id },
      data: input,
      include: { _count: { select: { groups: true } } }
    });

    await writeAuditLog(
      {
        schoolId: currentUser.schoolId,
        actorUserId: currentUser.id,
        action: "BRANCH_UPDATED",
        entityType: "Branch",
        entityId: branch.id,
        oldValue: {
          name: existing.name,
          status: existing.status,
          address: existing.address
        },
        newValue: {
          name: branch.name,
          status: branch.status,
          address: branch.address
        }
      },
      tx
    );

    return serializeBranch(branch);
  });
}
