import { describe, expect, it } from "vitest";
import { requiresChildStatusChangeComment } from "./child-service";

describe("child service rules", () => {
  it("requires comments only for transitions to left or archived", () => {
    expect(requiresChildStatusChangeComment("ACTIVE", "LEFT")).toBe(true);
    expect(requiresChildStatusChangeComment("ACTIVE", "ARCHIVED")).toBe(true);
    expect(requiresChildStatusChangeComment("LEFT", "LEFT")).toBe(false);
    expect(requiresChildStatusChangeComment("ACTIVE", "PAUSED")).toBe(false);
    expect(requiresChildStatusChangeComment("ACTIVE", undefined)).toBe(false);
  });
});
