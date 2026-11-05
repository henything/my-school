"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BillingSicknessDecision({ attendanceRecordId, childName }: { attendanceRecordId: string; childName: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState("ABSENT_SICK_CONFIRMED");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/billing-control/attendance/${attendanceRecordId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finalStatus: decision, comment })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось сохранить решение.");
      setMessage(result.warning ?? "Решение сохранено, начисления группы проверены.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-3 grid gap-2 rounded-lg bg-[var(--panel-soft)] p-3" aria-label={`Решение по болезни: ${childName}`}>
    <label className="grid gap-1 text-sm font-semibold">Решение
      <select className="field" value={decision} onChange={(event) => setDecision(event.target.value)} disabled={busy}>
        <option value="ABSENT_SICK_CONFIRMED">Подтвердить болезнь — создать перенос</option>
        <option value="ABSENT_UNEXCUSED_FINAL">Обычный платный пропуск — без переноса</option>
      </select>
    </label>
    <label className="grid gap-1 text-sm font-semibold">Основание решения
      <input className="field" required maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Какая справка проверена или почему пропуск платный" disabled={busy} />
    </label>
    <p className="text-xs text-[var(--muted)]">После сохранения система проверит недостающие счета текущего месяца в этой группе. Уже выставленные счета автоматически не переписываются.</p>
    <Button type="submit" disabled={busy || !comment.trim()}>{busy ? "Сохранение…" : "Сохранить решение"}</Button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
