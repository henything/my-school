"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type VacationRequestFormProps = {
  childId: string;
};

export function VacationRequestForm({ childId }: VacationRequestFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("childId", childId);

    try {
      const response = await fetch("/api/vacation-requests", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось отправить заявление.");
      }

      form.reset();
      setMessage("Заявление отправлено на проверку.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить заявление.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4 border-b border-[var(--line)] p-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="label">
          Отпуск с
          <input className="field" name="periodStart" type="date" required />
        </label>
        <label className="label">
          Отпуск по
          <input className="field" name="periodEnd" type="date" required />
        </label>
      </div>

      <label className="label">
        Заявление
        <input className="field" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
      </label>

      <label className="label">
        Комментарий
        <input className="field" name="comment" placeholder="Например: семейная поездка" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <FileUp aria-hidden="true" size={16} />}
          Отправить
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
