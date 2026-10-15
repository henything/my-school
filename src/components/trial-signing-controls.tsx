"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Signing = {
  status: string;
  contractStatus: string | null;
  consentStatus: string | null;
  errorMessage: string | null;
};

const labels: Record<string, string> = {
  PENDING: "Готовится к отправке", SENT: "Отправляется", WAITING: "Ожидает подписания",
  SIGNED: "Оба документа подписаны", DECLINED: "Родитель отказался подписывать",
  EXPIRED: "Срок подписания истёк", ERROR: "Ошибка отправки"
};

const documentLabels: Record<string, string> = {
  PREPARED: "подготовлен", CREATED_FROM_TEMPLATE: "создан из шаблона", WAIT_FILL: "родитель заполняет",
  WAIT_SIGN: "ожидает подписи", SEND_LINK: "ссылка отправлена", SIGNED: "подписан",
  CANCELED: "отклонён", ANNULED: "аннулирован", SIGNING_EXPIRED: "срок истёк",
  DELETED: "удалён", ERROR_SEND: "ошибка отправки", ERROR_SIGN: "ошибка подписи"
};

function documentStatus(status: string | null) {
  return status ? (documentLabels[status] ?? status) : "нет статуса";
}

export function TrialSigningControls({ trialId, attended, signing }: { trialId: string; attended: boolean; signing: Signing | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function action(method: "POST" | "PUT") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/trials/${trialId}/signing`, { method });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Не удалось связаться с F.Doc.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка F.Doc.");
    } finally {
      setBusy(false);
    }
  }

  if (!attended && !signing) return null;
  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm">
      <div className="font-semibold">Документы F.Doc</div>
      {signing ? (
        <div className="mt-1">
          <p>{labels[signing.status] ?? signing.status}</p>
          <p className="text-[var(--muted)]">Договор: {documentStatus(signing.contractStatus)} · Согласие: {documentStatus(signing.consentStatus)}</p>
          {signing.errorMessage ? <p className="text-[var(--danger)]">{signing.errorMessage}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {!signing && attended ? <Button type="button" size="sm" disabled={busy} onClick={() => void action("POST")}>Хочет продолжать — отправить договор и согласие</Button> : null}
        {signing?.contractStatus === "SIGNED" ? <a className="text-[var(--accent-strong)] underline" href={`/api/trials/${trialId}/signing/contract`}>Скачать договор</a> : null}
        {signing?.consentStatus === "SIGNED" ? <a className="text-[var(--accent-strong)] underline" href={`/api/trials/${trialId}/signing/consent`}>Скачать согласие</a> : null}
        {signing && signing.status !== "PENDING" && signing.status !== "SENT" && signing.status !== "ERROR" ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void action("PUT")}>Проверить статус</Button> : null}
      </div>
      {message ? <p className="mt-2 text-[var(--danger)]">{message}</p> : null}
    </div>
  );
}
