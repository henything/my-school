import type { UserRole } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/server/auth/current-user";

export const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];
export const COACH_FORBIDDEN_FINANCIAL_FIELDS = [
  "paymentStatus",
  "payment_status",
  "lessonPriceKopeks",
  "lesson_price_kopeks",
  "totalAmountKopeks",
  "total_amount_kopeks",
  "paymentStatusComment",
  "payment_status_comment",
  "lessonBalanceTransactions",
  "lesson_balance_transactions",
  "cachedLessonBalance",
  "cached_lesson_balance",
  "cachedMakeupBalance",
  "cached_makeup_balance",
  "financialComments",
  "financial_comments",
  "invoiceData",
  "invoice_data",
  "paymentHistory",
  "payment_history"
] as const;

const COACH_FORBIDDEN_FINANCIAL_FIELD_SET = new Set<string>(COACH_FORBIDDEN_FINANCIAL_FIELDS);

export function hasRole(user: Pick<CurrentUser, "role">, roles: UserRole[]) {
  return roles.includes(user.role);
}

export function canCreateUser(user: Pick<CurrentUser, "role">) {
  return user.role === "SUPER_ADMIN";
}

export function canSeeAdminShell(user: Pick<CurrentUser, "role">) {
  return hasRole(user, ADMIN_ROLES);
}

export function canSeeCoachShell(user: Pick<CurrentUser, "role">) {
  return user.role === "COACH";
}

export function canSeeAuditLog(user: Pick<CurrentUser, "role">) {
  return hasRole(user, ADMIN_ROLES);
}

export function containsCoachForbiddenFinancialField(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(containsCoachForbiddenFinancialField);
  }

  return Object.entries(value).some(([key, childValue]) => {
    if (COACH_FORBIDDEN_FINANCIAL_FIELD_SET.has(key)) {
      return true;
    }

    return containsCoachForbiddenFinancialField(childValue);
  });
}

export function assertRole(user: Pick<CurrentUser, "role">, roles: UserRole[]) {
  if (!hasRole(user, roles)) {
    throw new Error("You do not have access to this action.");
  }
}
