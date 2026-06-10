import { describe, expect, it } from "vitest";
import { countActiveChildren, DEFAULT_GROUP_CAPACITY, isGroupOverCapacity } from "./capacity";

describe("group capacity", () => {
  it("counts only active children for occupancy", () => {
    expect(
      countActiveChildren([
        { status: "ACTIVE" },
        { status: "PAUSED" },
        { status: "TRIAL" },
        { status: "ACTIVE" },
        { status: "ARCHIVED" }
      ])
    ).toBe(2);
  });

  it("creates over-capacity condition only above the limit", () => {
    expect(DEFAULT_GROUP_CAPACITY).toBe(15);
    expect(isGroupOverCapacity(15)).toBe(false);
    expect(isGroupOverCapacity(16)).toBe(true);
    expect(isGroupOverCapacity(4, 4)).toBe(false);
    expect(isGroupOverCapacity(5, 4)).toBe(true);
  });
});
