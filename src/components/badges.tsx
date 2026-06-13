import { cn } from "@/lib/cn";

export function RoleBadge({ role }: { role: string }) {
  const className =
    role === "SUPER_ADMIN"
      ? "bg-[#f4e8c1] text-[#684b05]"
      : role === "ADMIN"
        ? "bg-[#dff1ea] text-[#075a3d]"
        : "bg-[#e6eff8] text-[#214f78]";

  return <span className={cn("badge", className)}>{role}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE"
      ? "bg-[#dff1ea] text-[#075a3d]"
      : status === "INACTIVE"
        ? "bg-[#f7e4d1] text-[#7a3f0d]"
        : status === "CRITICAL"
          ? "bg-[#f8d8d4] text-[#8f1d17]"
          : status === "HIGH"
            ? "bg-[#f7e4d1] text-[#7a3f0d]"
            : status === "MEDIUM"
              ? "bg-[#e6eff8] text-[#214f78]"
              : status === "LOW"
                ? "bg-[#dff1ea] text-[#075a3d]"
                : status === "OPEN" || status === "IN_PROGRESS"
                  ? "bg-[#e6eff8] text-[#214f78]"
                  : status === "CLOSED"
                    ? "bg-[#dff1ea] text-[#075a3d]"
                    : status === "CANCELLED"
                      ? "bg-[#f8d8d4] text-[#8f1d17]"
                      : "bg-[#ececec] text-[#555]";

  return <span className={cn("badge", className)}>{status}</span>;
}
