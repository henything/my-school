"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Entry = { id: string; name: string; status: string };
export function DirectoryLifecycle({ kind, entry }: { kind: "branches" | "groups"; entry: Entry }) {
  const router = useRouter();
  const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const labels = { archive: "Архивировать", restore: "Восстановить", delete: "Удалить" };
  useEffect(() => { if (action) dialog.current?.showModal(); }, [action]);

  function close() { if (!busy) { dialog.current?.close(); setAction(null); } }
  async function submit() {
    if (!action || (action === "delete" && confirmation !== entry.name)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/${kind}/${entry.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action === "delete" ? {} : { body: JSON.stringify({ status: action === "archive" ? "ARCHIVED" : "ACTIVE" }) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить изменения.");
      dialog.current?.close(); setAction(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка соединения. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }
  function open(next: NonNullable<typeof action>) { setError(""); setConfirmation(""); setAction(next); }
  return <>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => open(entry.status === "ARCHIVED" ? "restore" : "archive")} aria-label={`${entry.status === "ARCHIVED" ? "Восстановить" : "Архивировать"} ${entry.name}`}>
        {entry.status === "ARCHIVED" ? "Восстановить" : "В архив"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => open("delete")} aria-label={`Удалить ${entry.name}`}>Удалить</Button>
    </div>
    {action ? <dialog ref={dialog} aria-labelledby={`lifecycle-title-${entry.id}`} onCancel={(event) => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-5 text-[var(--ink)] shadow-xl backdrop:bg-black/30">
      <h3 id={`lifecycle-title-${entry.id}`} className="text-lg font-bold">{labels[action]}: {entry.name}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {action === "delete" ? "Удаление необратимо. Оно доступно только для записей без связанных детей, групп, занятий, счетов и другой истории. Если данные есть, используйте архив." : action === "restore" ? "Запись снова станет доступна для работы. Шаблоны расписания группы останутся в архиве: проверьте и настройте расписание отдельно." : kind === "groups" ? "История посещений, счета и оплаты сохранятся. Новые записи и занятия будут закрыты, шаблоны расписания уйдут в архив. Сначала переведите действующих детей, отмените предстоящие занятия и завершите заявки на пробное." : "История сохранится. Филиал будет закрыт для новых записей. Сначала архивируйте все его группы."}
      </p>
      {action === "delete" ? <label className="mt-4 block text-sm">Для подтверждения введите название: <strong>{entry.name}</strong><input autoFocus className="field mt-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={close} disabled={busy}>Отмена</Button>
        <Button type="button" onClick={submit} disabled={busy || (action === "delete" && confirmation !== entry.name)}>{busy ? "Сохраняем…" : labels[action]}</Button>
      </div>
    </dialog> : null}
  </>;
}
