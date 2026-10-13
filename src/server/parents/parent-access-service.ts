import type { CurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { ADMIN_ROLES, assertRole } from "@/server/rbac/rbac";

export async function listParentAccessByGroup(currentUser: CurrentUser) {
  assertRole(currentUser, ADMIN_ROLES);
  const children = await getPrisma().child.findMany({
    where: { schoolId: currentUser.schoolId, status: "ACTIVE", currentGroupId: { not: null } },
    select: {
      id: true, fullName: true,
      currentGroup: { select: { id: true, name: true, branch: { select: { name: true } } } },
      parent: { select: {
        id: true, fullName: true, phone: true,
        account: { select: { status: true, user: { select: { status: true } } } },
        invites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 }
      } }
    },
    orderBy: [{ currentGroup: { name: "asc" } }, { fullName: "asc" }]
  });

  return children.filter((child) => child.currentGroup).map((child) => {
    const account = child.parent?.account;
    const status = account?.status === "BLOCKED" || account?.status === "ARCHIVED" || (account && account.user.status !== "ACTIVE")
      ? "BLOCKED" : account?.status === "ACTIVE" ? "ACTIVE" : !child.parent ? "NO_PARENT" : child.parent.invites.length > 0 ? "INVITED" : "NO_INVITE";
    return {
      groupId: child.currentGroup!.id,
      groupName: child.currentGroup!.name,
      branchName: child.currentGroup!.branch.name,
      childId: child.id,
      childName: child.fullName,
      parentId: child.parent?.id ?? null,
      parentName: child.parent?.fullName ?? null,
      parentPhone: child.parent?.phone ?? null,
      status
    };
  });
}
