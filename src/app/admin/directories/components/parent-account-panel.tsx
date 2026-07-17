"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";

type ParentOption = {
  id: string;
  fullName: string | null;
  phone: string | null;
};

type ParentAccount = {
  id: string;
  status: string;
  user: { login: string; displayName: string; status: string };
  parent: { id: string; fullName: string | null; phone: string | null; childrenCount: number };
};

type ParentAccountPanelProps = {
  parents: ParentOption[];
  accounts: ParentAccount[];
};

async function postJson<T>(path: string, body: unknown = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Не удалось выполнить действие.");
  }

  return payload;
}

export function ParentAccountPanel({ parents, accounts }: ParentAccountPanelProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <CreateParentInviteForm parents={parents} />
      <ParentResetPanel accounts={accounts} />
    </section>
  );
}

function CreateParentInviteForm({ parents }: { parents: ParentOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setActivationUrl("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const payload = await postJson<{ invite: { activationUrl: string; login: string; expiresAt: string } }>("/api/admin/parent-accounts/invites", {
        parentId: formData.get("parentId")
      });
      setActivationUrl(payload.invite.activationUrl);
      setMessage(`Логин: ${payload.invite.login}. Ссылка действует до ${new Date(payload.invite.expiresAt).toLocaleString("ru-RU")}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать ссылку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <UserCheck aria-hidden="true" size={18} />
        Родительский вход
      </h2>
      <div className="label">
        <span>Родитель</span>
        <SearchableCombobox
          name="parentId"
          required
          placeholder="Найти родителя"
          options={parents.map((parent) => ({
            value: parent.id,
            label: parent.fullName ?? parent.phone ?? parent.id,
            description: parent.phone ?? "без телефона"
          }))}
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        Создать ссылку
      </Button>
      {message ? <p className="text-sm font-semibold text-[var(--muted)]">{message}</p> : null}
      {activationUrl ? <textarea className="field min-h-24 py-3" readOnly value={activationUrl} /> : null}
    </form>
  );
}

function ParentResetPanel({ accounts }: { accounts: ParentAccount[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [submittingId, setSubmittingId] = useState("");

  async function createReset(accountId: string) {
    setMessage("");
    setResetUrl("");
    setSubmittingId(accountId);

    try {
      const payload = await postJson<{ reset: { resetUrl: string; login: string; expiresAt: string } }>(
        `/api/admin/parent-accounts/${accountId}/password-reset`
      );
      setResetUrl(payload.reset.resetUrl);
      setMessage(`Логин: ${payload.reset.login}. Ссылка действует до ${new Date(payload.reset.expiresAt).toLocaleString("ru-RU")}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать ссылку.");
    } finally {
      setSubmittingId("");
    }
  }

  return (
    <div className="panel grid content-start gap-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <KeyRound aria-hidden="true" size={18} />
        Сброс пароля
      </h2>
      <div className="grid gap-3">
        {accounts.map((account) => (
          <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-4 py-3">
            <div>
              <div className="font-semibold">{account.parent.fullName ?? account.user.displayName}</div>
              <div className="text-sm text-[var(--muted)]">
                {account.user.login} · {account.status}
              </div>
            </div>
            <Button type="button" variant="secondary" disabled={account.status !== "ACTIVE" || submittingId === account.id} onClick={() => createReset(account.id)}>
              {submittingId === account.id ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
              Reset
            </Button>
          </div>
        ))}
        {accounts.length === 0 ? <p className="text-sm font-semibold text-[var(--muted)]">Активированных родительских аккаунтов пока нет.</p> : null}
      </div>
      {message ? <p className="text-sm font-semibold text-[var(--muted)]">{message}</p> : null}
      {resetUrl ? <textarea className="field min-h-24 py-3" readOnly value={resetUrl} /> : null}
    </div>
  );
}
