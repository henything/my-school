"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Followup = {
  id: string;
  lessonId: string;
  childName: string | null;
  parentName: string | null;
  parentPhone: string | null;
  status: string;
  comment: string | null;
  lesson: { lessonDate: string };
  group: { name: string };
};

export function TrialTaskActions({ trial }: { trial: Followup }) {
  const router = useRouter();
  const [comment, setComment] = useState(trial.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function update(status: "CONTACT_COLLECTED" | "WANTS_TO_CONTINUE" | "NOT_PLANNING") {
    if (status === "CONTACT_COLLECTED" && !comment.trim()) {
      setError("Запишите краткий итог разговора.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/trials/${trial.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(status === "CONTACT_COLLECTED" ? { comment: comment.trim() } : {}) })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Не удалось сохранить решение.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить решение.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 border-t border-[var(--line)] pt-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <strong>{trial.childName ?? "Пробник"}</strong>
        <p className="mt-1 text-sm text-[var(--muted)]">{trial.lesson.lessonDate} · {trial.group.name}</p>
        <p className="mt-1 text-sm">Родитель: {trial.parentName ?? "не указан"} · {trial.parentPhone ? <a className="font-semibold text-[var(--accent-strong)]" href={`tel:${trial.parentPhone}`}>{trial.parentPhone}</a> : "телефон не указан"}</p>
      </div>
      <Link className="text-sm font-semibold text-[var(--accent-strong)] underline" href={`/coach/lessons/${trial.lessonId}`}>Открыть занятие</Link>
    </div>
    {trial.status === "TRIAL_ATTENDED" ? <div className="mt-4 grid gap-2">
      <label className="label">Итог разговора с родителем
        <textarea className="field min-h-20" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Что сообщили родителю и когда ждать решение" />
      </label>
      <div><Button type="button" disabled={busy} onClick={() => void update("CONTACT_COLLECTED")}>Контакт состоялся</Button></div>
    </div> : <div className="mt-4 grid gap-2">
      {trial.comment ? <p className="text-sm text-[var(--muted)]">Итог контакта: {trial.comment}</p> : null}
      <p className="text-sm font-semibold">Отметьте решение родителя:</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void update("WANTS_TO_CONTINUE")}>Будет ходить</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void update("NOT_PLANNING")}>Пока не планирует ходить</Button>
      </div>
    </div>}
    {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
  </div>;
}
