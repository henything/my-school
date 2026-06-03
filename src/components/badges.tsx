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
        : "bg-[#ececec] text-[#555]";

  return <span className={cn("badge", className)}>{status}</span>;
}
