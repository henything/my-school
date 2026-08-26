"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

type UserStatusFormProps = {
  userId: string;
  status: string;
  disabled?: boolean;
};

export function UserStatusForm({ userId, status, disabled = false }: UserStatusFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: formData.get("status")
      })
    });

    setIsSaving(false);
    router.refresh();
  }

  return (
    <form className="flex min-w-[210px] items-center gap-2" onSubmit={onSubmit}>
      <select className="field min-h-9" name="status" defaultValue={status} disabled={disabled}>
        <option value="ACTIVE">{labelForEnum("ACTIVE")}</option>
        <option value="INACTIVE">{labelForEnum("INACTIVE")}</option>
        <option value="ARCHIVED">{labelForEnum("ARCHIVED")}</option>
      </select>
      <Button type="submit" size="icon" variant="secondary" disabled={disabled || isSaving} title="Сохранить статус">
        <Save aria-hidden="true" size={15} />
      </Button>
    </form>
  );
}
