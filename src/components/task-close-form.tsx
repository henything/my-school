"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type TaskCloseFormProps = {
  taskId: string;
  requiresComment?: boolean;
  allowCancel?: boolean;
};

export function TaskCloseForm({ taskId, requiresComment = false, allowCancel = false }: TaskCloseFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"CLOSED" | "CANCELLED">("CLOSED");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/tasks/${taskId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          comment: formData.get("comment")
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось закрыть задачу.");
      }

      setMessage(status === "CANCELLED" ? "Задача отменена." : "Задача закрыта.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось закрыть задачу.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid min-w-[220px] gap-2" onSubmit={onSubmit}>
      {allowCancel ? (
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value as "CLOSED" | "CANCELLED")}>
          <option value="CLOSED">Закрыть</option>
          <option value="CANCELLED">Отменить</option>
        </select>
      ) : null}
      <input className="field" name="comment" placeholder={requiresComment ? "Комментарий обязателен" : "Комментарий"} required={requiresComment} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : null}
          Сохранить
        </Button>
        {message ? <span className="text-xs font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
