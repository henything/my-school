import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";

export function RoleBadge({ role }: { role: string }) {
  const className =
    role === "SUPER_ADMIN"
      ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]"
      : role === "ADMIN"
        ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
        : role === "PARENT"
          ? "bg-[#fff0e5] text-[#a34300]"
          : "bg-[var(--blue-soft)] text-[var(--accent-strong)]";

  return <span className={cn("badge", className)}>{labelForEnum(role)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE"
      ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
      : status === "INACTIVE"
        ? "bg-[#eef1eb] text-[#52625b]"
        : status === "CRITICAL"
          ? "bg-[var(--red-soft)] text-[var(--danger-strong)]"
          : status === "HIGH"
            ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]"
            : status === "MEDIUM"
              ? "bg-[var(--blue-soft)] text-[var(--accent-strong)]"
              : status === "LOW"
                ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
                : status === "OPEN" || status === "IN_PROGRESS"
                  ? "bg-[var(--blue-soft)] text-[var(--accent-strong)]"
                  : status === "CLOSED"
                    ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
        : status === "CANCELLED"
          ? "bg-[var(--red-soft)] text-[var(--danger-strong)]"
          : status === "TRIAL_BOOKED"
            ? "bg-[var(--blue-soft)] text-[var(--accent-strong)]"
            : status === "CONTACT_COLLECTED"
              ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
            : status === "TRIAL_ATTENDED"
                ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]"
                : status === "TRIAL_NO_SHOW"
                  ? "bg-[var(--red-soft)] text-[var(--danger-strong)]"
                  : status === "TRANSFERRED_TO_ADMIN"
                    ? "bg-[#ececec] text-[#555]"
                    : status === "CONVERTED_TO_ACTIVE"
                      ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
                      : "bg-[#ececec] text-[#555]";

  return <span className={cn("badge", className)}>{labelForEnum(status)}</span>;
}
