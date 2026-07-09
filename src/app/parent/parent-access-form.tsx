"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type ParentAccessFormProps = {
  token: string;
  mode: "activate" | "reset";
};

export function ParentAccessForm({ token, mode }: ParentAccessFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const endpoint = mode === "activate" ? "/api/auth/parent/activate" : "/api/auth/parent/password-reset/confirm";
  const buttonLabel = mode === "activate" ? "Активировать кабинет" : "Сменить пароль";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const password = formData.get("password");
    const passwordConfirm = formData.get("passwordConfirm");

    if (password !== passwordConfirm) {
      setMessage("Пароли не совпадают.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; redirectTo?: string };

    setIsSubmitting(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Не удалось сохранить пароль.");
      return;
    }

    router.push(payload.redirectTo ?? "/parent");
    router.refresh();
  }

  return (
    <form className="panel mx-auto grid w-full max-w-md gap-5 p-6" onSubmit={onSubmit}>
      <div>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
          {mode === "activate" ? <UserCheck aria-hidden="true" size={20} /> : <LockKeyhole aria-hidden="true" size={20} />}
        </div>
        <h1 className="text-2xl font-bold">{mode === "activate" ? "Активация кабинета" : "Восстановление пароля"}</h1>
      </div>

      <label className="label">
        Новый пароль
        <input className="field" name="password" type="password" minLength={10} autoComplete="new-password" required />
      </label>

      <label className="label">
        Повторите пароль
        <input className="field" name="passwordConfirm" type="password" minLength={10} autoComplete="new-password" required />
      </label>

      {message ? (
        <div className="rounded-lg border border-[#f0b8b4] bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[var(--danger)]">
          {message}
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting || !token}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        {buttonLabel}
      </Button>
    </form>
  );
}
