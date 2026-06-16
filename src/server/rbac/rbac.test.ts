import { describe, expect, it } from "vitest";
import { canCreateUser, canSeeAdminShell, canSeeAuditLog, canSeeCoachShell, containsCoachForbiddenFinancialField, hasRole } from "./rbac";

describe("rbac", () => {
  it("allows only SUPER_ADMIN to create users", () => {
    expect(canCreateUser({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canCreateUser({ role: "ADMIN" })).toBe(false);
    expect(canCreateUser({ role: "COACH" })).toBe(false);
  });

  it("separates admin and coach shells", () => {
    expect(canSeeAdminShell({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canSeeAdminShell({ role: "ADMIN" })).toBe(true);
    expect(canSeeAdminShell({ role: "COACH" })).toBe(false);
    expect(canSeeCoachShell({ role: "COACH" })).toBe(true);
    expect(canSeeCoachShell({ role: "ADMIN" })).toBe(false);
  });

  it("checks explicit role lists", () => {
    expect(hasRole({ role: "ADMIN" }, ["SUPER_ADMIN", "ADMIN"])).toBe(true);
    expect(hasRole({ role: "COACH" }, ["SUPER_ADMIN", "ADMIN"])).toBe(false);
  });

  it("allows only admins to read the audit log", () => {
    expect(canSeeAuditLog({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canSeeAuditLog({ role: "ADMIN" })).toBe(true);
    expect(canSeeAuditLog({ role: "COACH" })).toBe(false);
  });

  it("detects forbidden financial fields in coach payloads", () => {
    expect(
      containsCoachForbiddenFinancialField({
        child: {
          fullName: "Иван Петров",
          admissionStatus: "ADMITTED",
          cachedLessonBalance: -1
        }
      })
    ).toBe(true);
    expect(
      containsCoachForbiddenFinancialField({
        child: {
          fullName: "Иван Петров",
          admissionStatus: "NOT_ADMITTED"
        }
      })
    ).toBe(false);
  });
});
