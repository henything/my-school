export const DEFAULT_GROUP_CAPACITY = 15;

export function countActiveChildren(children: Array<{ status: string }>) {
  return children.filter((child) => child.status === "ACTIVE").length;
}

export function isGroupOverCapacity(activeChildrenCount: number, capacityLimit = DEFAULT_GROUP_CAPACITY) {
  return activeChildrenCount > capacityLimit;
}
