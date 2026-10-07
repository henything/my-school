import { describe, expect, it } from "vitest";
import { serializeGroup } from "./group-service";
import { updateGroupSchema } from "./schemas";

const group = {
  id: "group-1",
  name: "Группа 81",
  address: null,
  status: "ACTIVE",
  capacityLimit: 15,
  comment: null,
  createdAt: new Date("2026-10-07T00:00:00.000Z"),
  branch: { id: "branch-1", name: "Филиал 81", address: "Адрес филиала" },
  mainCoach: {
    id: "coach-1",
    user: { id: "user-1", displayName: "Тренер", login: "coach", status: "ACTIVE" }
  },
  children: []
};

describe("group address", () => {
  it("uses the branch address until the group has its own", () => {
    expect(serializeGroup(group).address).toBe("Адрес филиала");
    expect(serializeGroup({ ...group, address: "Отдельный адрес" }).address).toBe("Отдельный адрес");
  });

  it("turns an empty address edit into a branch fallback", () => {
    expect(updateGroupSchema.parse({ address: "  Новый адрес  " }).address).toBe("Новый адрес");
    expect(updateGroupSchema.parse({ address: "  " }).address).toBeNull();
  });
});
