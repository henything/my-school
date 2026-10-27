import { describe, expect, it } from "vitest";
import {
  assertNoCoachForbiddenFinancialFields,
  canCreateCoach,
  canCreateUser,
  canManageUserStatus,
  canSeeAdminShell,
  canSeeAuditLog,
  canSeeCoachShell,
  containsCoachForbiddenFinancialField,
  hasRole
} from "./rbac";

describe("rbac", () => {
  it("allows administrators to create users", () => {
    expect(canCreateUser({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canCreateUser({ role: "ADMIN" })).toBe(true);
    expect(canCreateUser({ role: "COACH" })).toBe(false);
  });

  it("allows administrators to create coaches", () => {
    expect(canCreateCoach({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canCreateCoach({ role: "ADMIN" })).toBe(true);
    expect(canCreateCoach({ role: "COACH" })).toBe(false);
    expect(canCreateCoach({ role: "PARENT" })).toBe(false);
  });

  it("protects the superadmin and the actor's own account from status changes", () => {
    const admin = { id: "admin-1", role: "ADMIN" as const };
    const superadmin = { id: "super-1", role: "SUPER_ADMIN" as const };
    expect(canManageUserStatus(admin, { id: "coach-1", role: "COACH" })).toBe(true);
    expect(canManageUserStatus(admin, { id: "admin-2", role: "ADMIN" })).toBe(true);
    expect(canManageUserStatus(admin, { id: "super-1", role: "SUPER_ADMIN" })).toBe(false);
    expect(canManageUserStatus(admin, admin)).toBe(false);
    expect(canManageUserStatus(superadmin, { id: "super-2", role: "SUPER_ADMIN" })).toBe(true);
    expect(canManageUserStatus(superadmin, superadmin)).toBe(false);
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

  it("fails closed when a coach response contains financial fields", () => {
    expect(() =>
      assertNoCoachForbiddenFinancialFields(
        { role: "COACH" },
        {
          lesson: {
            children: [{ id: "child-1", admissionStatus: "ADMITTED", cachedMakeupBalance: 1 }]
          }
        }
      )
    ).toThrow("Ответ для тренера содержит запрещённые финансовые поля.");

    expect(() =>
      assertNoCoachForbiddenFinancialFields(
        { role: "ADMIN" },
        {
          child: { cachedLessonBalance: -1 }
        }
      )
    ).not.toThrow();
  });
});
