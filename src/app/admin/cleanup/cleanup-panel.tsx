"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Parent = { id: string; fullName: string | null; phone: string | null };
type Child = { id: string; fullName: string; status: string };
type Preview = Record<string, unknown>;

export function CleanupPanel({ parents, childRows }: { parents: Parent[]; childRows: Child[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"parents" | "children">("parents");
  const [id, setId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function request(path: string, body?: unknown) {
    const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const payload = (await response.json().catch(() => ({}))) as { preview?: Preview; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Не удалось выполнить действие.");
    return payload;
  }

  async function showPreview() {
    if (!id) return;
    setLoading(true); setMessage(""); setPreview(null);
    try { setPreview((await request(`/api/admin/cleanup/${kind}/${id}`)).preview ?? null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось получить связи записи."); }
    finally { setLoading(false); }
  }

  async function apply(action: "archive" | "merge") {
    if (!preview || !reason.trim() || (action === "merge" && !targetId)) return;
    setLoading(true); setMessage("");
    try {
      await request(`/api/admin/cleanup/${kind}/${id}`, kind === "children" ? { reason: reason.trim() } : { action, reason: reason.trim(), targetId: action === "merge" ? targetId : undefined });
      setPreview(null); setId(""); setReason(""); setTargetId("");
      setMessage(action === "merge" ? "Карточки объединены; история сохранена." : "Карточка архивирована; история сохранена.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось выполнить действие."); }
    finally { setLoading(false); }
  }

  return <section className="panel grid gap-4 p-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label">Тип записи<select className="field" value={kind} onChange={(event) => { setKind(event.target.value as "parents" | "children"); setId(""); setPreview(null); }}><option value="parents">Родитель</option><option value="children">Ребёнок</option></select></label>
      <label className="label">Карточка<select className="field" value={id} onChange={(event) => { setId(event.target.value); setPreview(null); }}><option value="">Выберите запись</option>{kind === "parents" ? parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.fullName ?? "Без имени"} · {parent.phone ?? "без телефона"}</option>) : childRows.filter((child) => child.status !== "ARCHIVED").map((child) => <option key={child.id} value={child.id}>{child.fullName} · {child.status}</option>)}</select></label>
    </div>
    <Button type="button" variant="secondary" disabled={!id || loading} onClick={showPreview}>Показать связанные данные</Button>
    {preview ? <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
      {kind === "parents" ? <><div>Дети: {Array.isArray(preview.children) ? preview.children.map((child) => (child as { fullName: string; status: string }).fullName + " (" + (child as { status: string }).status + ")").join(", ") || "нет" : "нет"}</div><div>Табели: {String(preview.attendanceCount)} · Счета: {String(preview.invoiceCount)} · Платежи: {String(preview.paymentCount)}</div><div>Активных детей: {String(preview.activeChildren)}</div></> : <><div>Ребёнок: {String(preview.fullName)}</div><div>Группа: {(preview.currentGroup as { name?: string } | null)?.name ?? "нет"}</div><div>Связи: {JSON.stringify(preview._count)}</div></>}
      <label className="label">Причина<input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Например, тестовая карточка" /></label>
      {kind === "parents" ? <label className="label">Объединить с родителем<select className="field" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Выберите основную карточку</option>{parents.filter((parent) => parent.id !== id).map((parent) => <option key={parent.id} value={parent.id}>{parent.fullName ?? "Без имени"} · {parent.phone ?? "без телефона"}</option>)}</select></label> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="danger" disabled={loading || !reason.trim()} onClick={() => apply("archive")}>Архивировать</Button>{kind === "parents" ? <Button type="button" disabled={loading || !reason.trim() || !targetId} onClick={() => apply("merge")}>Объединить без удаления истории</Button> : null}</div>
      <p className="text-xs text-[var(--muted)]">Счета, платежи и посещения не удаляются. При объединении связи переносятся в основную карточку; действие записывается в аудит.</p>
    </div> : null}
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </section>;
}
