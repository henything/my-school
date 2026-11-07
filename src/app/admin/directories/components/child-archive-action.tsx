"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ChildArchiveAction({ childId, childName, status }: { childId: string; childName: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  function close() { if (!busy) { dialog.current?.close(); setOpen(false); } }
  async function archive() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/cleanup/children/${childId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() || "Архивация администратором" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось архивировать ребёнка.");
      dialog.current?.close(); setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка соединения."); }
    finally { setBusy(false); }
  }
  if (status === "ARCHIVED") return null;
  return <>
    <Button type="button" variant="secondary" size="sm" aria-label={`Архивировать ${childName}`} onClick={() => { setReason(""); setError(""); setOpen(true); }}>В архив</Button>
    {open ? <dialog ref={dialog} aria-labelledby={`archive-child-${childId}`} onCancel={event => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 text-[var(--ink)] shadow-xl backdrop:bg-black/30">
      <h3 id={`archive-child-${childId}`} className="text-lg font-bold">Архивировать: {childName}</h3>
      <p className="mt-3 text-sm leading-6">Ребёнок будет убран из группы и будущих табелей. Неоплаченные счета отменятся и перестанут учитываться в долге и начислениях аналитики.</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Платежи и посещения сохранятся. Счета с оплатой, зачётом или использованным переносом или незавершённой оплатой останутся для проверки: администратор получит задачу. Возврат денег автоматически не проводится.</p>
      <label className="label mt-4">Причина (необязательно)<input className="field" value={reason} onChange={event => setReason(event.target.value)} /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--danger-strong)]">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="danger" disabled={busy} onClick={() => void archive()}>{busy ? "Архивируем…" : "Архивировать"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={close}>Отмена</Button></div>
    </dialog> : null}
  </>;
}
