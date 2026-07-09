"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        login: formData.get("login"),
        password: formData.get("password")
      })
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      redirectTo?: string;
    };

    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "Не удалось войти.");
      return;
    }

    router.push(payload.redirectTo ?? "/admin");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <label className="label">
        Логин или телефон
        <input className="field" name="login" autoComplete="username" required />
      </label>

      <label className="label">
        Пароль
        <input className="field" name="password" type="password" autoComplete="current-password" required />
      </label>

      {error ? (
        <div className="rounded-lg border border-[#f0b8b4] bg-[#fff1f0] px-3 py-2 text-sm font-semibold text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <LogIn aria-hidden="true" size={16} />}
        Войти
      </Button>
    </form>
  );
}
