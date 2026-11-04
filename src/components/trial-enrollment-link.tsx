"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TrialEnrollmentLink({ trialId }: { trialId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  async function copy() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/trials/${trialId}/enrollment-invite`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось получить ссылку.");
      const link = new URL(body.path, window.location.origin).toString();
      setUrl(link);
      try { await navigator.clipboard.writeText(link); setMessage("Ссылка скопирована. Отправьте её родителю лично."); }
      catch { setMessage("Скопируйте ссылку из поля ниже и отправьте родителю лично."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось получить ссылку."); }
    finally { setBusy(false); }
  }
  return <div className="grid min-w-0 gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
    <p className="text-sm font-semibold">Регистрация родителя после пробного</p>
    <p className="text-sm text-[var(--muted)]">Родитель заполнит анкету, выберет график и подпишет документы. Ссылка и резерв действуют 72 часа. Повторное копирование не продлевает срок; после истечения кнопка обновит ссылку при наличии места.</p>
    <div><Button type="button" size="sm" disabled={busy} onClick={() => void copy()}>Скопировать ссылку для родителя</Button></div>
    {url ? <label className="label">Персональная ссылка<input className="field w-full min-w-0" readOnly value={url} onFocus={event => event.target.select()} /></label> : null}
    {message ? <p className="text-sm" role="status">{message}</p> : null}
  </div>;
}
