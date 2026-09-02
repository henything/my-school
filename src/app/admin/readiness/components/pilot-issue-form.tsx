"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Bug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

type PilotIssueFormProps = {
  titlePrefix: string;
  defaultPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
};

const categories = [
  ["Bug", "Bug"],
  ["UX", "UX"],
  ["Data", "Данные"],
  ["Training", "Обучение"],
  ["Stabilization", "Стабилизация"]
] as const;

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

export function PilotIssueForm({ titlePrefix, defaultPriority }: PilotIssueFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const category = String(formData.get("category") ?? "Bug");
    const title = String(formData.get("title") ?? "").trim();
    const description = nullable(formData.get("description"));

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: formData.get("priority"),
          title: `${titlePrefix}[${category}] ${title}`,
          description: description ? `Readiness intake\n\n${description}` : "Readiness intake"
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
        <Bug className="text-[var(--accent)]" aria-hidden="true" size={18} />
        Pilot intake
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Категория
          <select className="field" name="category" defaultValue="Bug">
            {categories.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Приоритет
          <select className="field" name="priority" defaultValue={defaultPriority}>
            {priorities.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label">
        Заголовок
        <input className="field" name="title" minLength={3} required />
      </label>
      <label className="label">
        Детали
        <textarea className="field min-h-28" name="description" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Создать задачу
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
