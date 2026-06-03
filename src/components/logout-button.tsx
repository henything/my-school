"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="secondary" onClick={logout} title="Выйти">
      <LogOut aria-hidden="true" size={16} />
      Выйти
    </Button>
  );
}
