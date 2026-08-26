"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

type UserOption = {
  id: string;
  displayName: string;
  login: string;
  role: string;
  status: string;
};

type ManualTaskFormProps = {
  users: UserOption[];
};

const priorities = [
  ["CRITICAL", labelForEnum("CRITICAL")],
  ["HIGH", labelForEnum("HIGH")],
  ["MEDIUM", labelForEnum("MEDIUM")],
  ["LOW", labelForEnum("LOW")]
] as const;

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function ManualTaskForm({ users }: ManualTaskFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeUsers = users.filter((user) => user.status === "ACTIVE");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: formData.get("priority"),
          assigneeUserId: nullable(formData.get("assigneeUserId")),
          title: formData.get("title"),
          description: nullable(formData.get("description")),
          dueAt: nullable(formData.get("dueAt"))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось создать задачу.");
      }

      form.reset();
      setMessage("Задача создана.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать задачу.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ClipboardPlus aria-hidden="true" size={18} />
        Ручная задача
      </h2>
      <label className="label">
        Заголовок
        <input className="field" name="title" required />
      </label>
      <label className="label">
        Адресат
        <select className="field" name="assigneeUserId">
          <option value="">Общая задача админам</option>
          {activeUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} · {labelForEnum(user.role)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Приоритет
          <select className="field" name="priority" defaultValue="MEDIUM">
            {priorities.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Дедлайн
          <input className="field" name="dueAt" type="date" />
        </label>
      </div>
      <label className="label">
        Описание
        <textarea className="field min-h-24" name="description" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Создать
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
