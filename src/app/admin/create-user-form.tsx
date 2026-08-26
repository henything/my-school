"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

export function CreateUserForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        login: formData.get("login"),
        password: formData.get("password"),
        displayName: formData.get("displayName"),
        role: formData.get("role")
      })
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Не удалось создать пользователя.");
      return;
    }

    form.reset();
    setMessage("Пользователь создан.");
    router.refresh();
  }

  return (
    <form className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_160px_auto] lg:items-end" onSubmit={onSubmit}>
      <label className="label">
        Имя
        <input className="field" name="displayName" minLength={2} required />
      </label>
      <label className="label">
        Логин
        <input className="field" name="login" minLength={3} autoComplete="off" required />
      </label>
      <label className="label">
        Пароль
        <input className="field" name="password" type="password" minLength={10} autoComplete="new-password" required />
      </label>
      <label className="label">
        Роль
        <select className="field" name="role" defaultValue="COACH">
          <option value="COACH">{labelForEnum("COACH")}</option>
          <option value="ADMIN">{labelForEnum("ADMIN")}</option>
        </select>
      </label>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <UserPlus aria-hidden="true" size={16} />}
        Создать
      </Button>
      {message ? <p className="text-sm font-semibold text-[var(--muted)] lg:col-span-5">{message}</p> : null}
    </form>
  );
}
