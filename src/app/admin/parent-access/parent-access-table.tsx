"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Row = { groupId: string; groupName: string; branchName: string; childId: string; childName: string; parentId: string | null; parentName: string | null; parentPhone: string | null; status: string };
const statusLabel: Record<string, string> = { ACTIVE: "Подключён", INVITED: "Приглашение ожидает", NO_INVITE: "Приглашения нет", NO_PARENT: "Родитель не указан", BLOCKED: "Доступ заблокирован" };

export function ParentAccessTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const groups = Array.from(new Map(rows.map((row) => [row.groupId, `${row.branchName} · ${row.groupName}`])).entries());
  const visible = groupId ? rows.filter((row) => row.groupId === groupId) : rows;

  async function invite(parentId: string) {
    setLoadingId(parentId); setMessage(""); setInviteUrl("");
    try {
      const response = await fetch("/api/admin/parent-accounts/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId }) });
      const payload = (await response.json()) as { invite?: { activationUrl: string }; error?: string };
      if (!response.ok || !payload.invite) throw new Error(payload.error ?? "Не удалось создать приглашение.");
      setInviteUrl(payload.invite.activationUrl);
      setMessage("Приглашение создано. Скопируйте ссылку и передайте родителю.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось создать приглашение."); }
    finally { setLoadingId(""); }
  }

  return <section className="panel grid gap-4 p-5">
    <label className="label max-w-md">Группа<select className="field" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Все группы</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <div className="overflow-x-auto"><table className="data-table min-w-[800px]"><thead><tr><th>Группа</th><th>Ребёнок</th><th>Родитель</th><th>Телефон</th><th>Доступ</th><th>Действие</th></tr></thead><tbody>
      {visible.map((row) => <tr key={row.childId}><td>{row.branchName} · {row.groupName}</td><td>{row.childName}</td><td>{row.parentName ?? "—"}</td><td>{row.parentPhone ?? "—"}</td><td>{statusLabel[row.status] ?? row.status}</td><td>{["NO_INVITE", "INVITED"].includes(row.status) && row.parentId ? <Button type="button" size="sm" variant="secondary" disabled={loadingId === row.parentId || !row.parentPhone} onClick={() => invite(row.parentId!)}>{row.status === "INVITED" ? "Повторить" : "Пригласить"}</Button> : "—"}</td></tr>)}
      {visible.length === 0 ? <tr><td colSpan={6}>В выбранной группе нет активных детей.</td></tr> : null}
    </tbody></table></div>
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
    {inviteUrl ? <textarea className="field min-h-20" readOnly value={inviteUrl} aria-label="Ссылка приглашения" /> : null}
  </section>;
}
