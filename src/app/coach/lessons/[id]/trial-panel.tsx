"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2, Phone, UserRoundPlus } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";

type TrialStatus = "TRIAL_BOOKED" | "TRIAL_ATTENDED" | "TRIAL_NO_SHOW" | "CONTACT_COLLECTED" | "TRANSFERRED_TO_ADMIN" | "CONVERTED_TO_ACTIVE";

type Trial = {
  id: string;
  childName: string | null;
  childAge: number | null;
  parentName: string | null;
  parentPhone: string | null;
  parentVkUrl: string | null;
  source: string;
  status: TrialStatus;
  comment: string | null;
  convertedChild: { id: string; fullName: string; status: string } | null;
};

type TrialPanelProps = {
  lessonId: string;
  trials: Trial[];
};

const sources = [
  ["UNKNOWN", "Не указан"],
  ["VK", "VK"],
  ["REFERRAL", "Рекомендация"],
  ["KINDERGARTEN", "Детский сад"],
  ["ADVERTISING", "Реклама"],
  ["OTHER", "Другое"]
] as const;

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function TrialPanel({ lessonId, trials }: TrialPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);

  async function createTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsCreating(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/coach/lessons/${lessonId}/trials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: nullable(formData.get("childName")),
          childAge: nullable(formData.get("childAge")),
          parentName: nullable(formData.get("parentName")),
          parentPhone: nullable(formData.get("parentPhone")),
          parentVkUrl: nullable(formData.get("parentVkUrl")),
          source: formData.get("source"),
          comment: nullable(formData.get("comment"))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось добавить пробника.");
      }

      form.reset();
      setMessage("Пробник добавлен.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить пробника.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UserRoundPlus aria-hidden="true" size={18} />
            Пробники
          </h2>
          <span className="badge bg-[#e6eff8] text-[#214f78]">{trials.length}</span>
        </div>
        <form className="grid gap-4 p-4" onSubmit={createTrial}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="label">
              Имя ребёнка
              <input className="field" name="childName" />
            </label>
            <label className="label">
              Возраст
              <input className="field" name="childAge" type="number" min="0" max="18" />
            </label>
            <label className="label">
              Источник
              <select className="field" name="source" defaultValue="UNKNOWN">
                {sources.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="label">
              Родитель
              <input className="field" name="parentName" />
            </label>
            <label className="label">
              Телефон
              <input className="field" name="parentPhone" />
            </label>
            <label className="label">
              VK
              <input className="field" name="parentVkUrl" />
            </label>
          </div>
          <label className="label">
            Комментарий
            <input className="field" name="comment" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isCreating || isPending}>
              {isCreating ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
              Добавить
            </Button>
            {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
          </div>
        </form>
      </div>

      {trials.length === 0 ? (
        <p className="panel p-5 text-sm text-[var(--muted)]">Пробников в этом занятии нет.</p>
      ) : (
        <div className="grid gap-3">
          {trials.map((trial) => (
            <TrialCard key={trial.id} trial={trial} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrialCard({ trial }: { trial: Trial }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = trial.status === "TRANSFERRED_TO_ADMIN" || trial.status === "CONVERTED_TO_ACTIVE";

  async function submitStatus(form: HTMLFormElement, status?: TrialStatus) {
    setMessage("");
    setIsSubmitting(true);
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/trials/${trial.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          childName: nullable(formData.get("childName")),
          childAge: nullable(formData.get("childAge")),
          parentName: nullable(formData.get("parentName")),
          parentPhone: nullable(formData.get("parentPhone")),
          parentVkUrl: nullable(formData.get("parentVkUrl")),
          source: formData.get("source"),
          comment: nullable(formData.get("comment"))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось сохранить пробника.");
      }

      setMessage("Сохранено.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить пробника.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function submitFromButton(status: TrialStatus) {
    if (formRef.current) {
      void submitStatus(formRef.current, status);
    }
  }

  return (
    <form
      ref={formRef}
      className="panel grid gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submitStatus(event.currentTarget);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{trial.childName ?? "Пробник без имени"}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            {trial.childAge !== null ? <span>{trial.childAge} лет</span> : null}
            {trial.parentName ? <span>{trial.parentName}</span> : null}
            {trial.parentPhone ? (
              <a className="inline-flex items-center gap-1 font-semibold text-[var(--accent-strong)]" href={`tel:${trial.parentPhone}`}>
                <Phone aria-hidden="true" size={14} />
                {trial.parentPhone}
              </a>
            ) : null}
            {trial.parentVkUrl ? (
              <a className="font-semibold text-[var(--accent-strong)]" href={trial.parentVkUrl} target="_blank" rel="noreferrer">
                VK
              </a>
            ) : null}
          </div>
        </div>
        <StatusBadge status={trial.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="label">
          Имя ребёнка
          <input className="field" name="childName" defaultValue={trial.childName ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          Возраст
          <input className="field" name="childAge" type="number" min="0" max="18" defaultValue={trial.childAge ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          Источник
          <select className="field" name="source" defaultValue={trial.source} disabled={disabled}>
            {sources.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="label">
          Родитель
          <input className="field" name="parentName" defaultValue={trial.parentName ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          Телефон
          <input className="field" name="parentPhone" defaultValue={trial.parentPhone ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          VK
          <input className="field" name="parentVkUrl" defaultValue={trial.parentVkUrl ?? ""} disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" defaultValue={trial.comment ?? ""} disabled={disabled} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={disabled || isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : null}
          Сохранить
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || isSubmitting} onClick={() => submitFromButton("CONTACT_COLLECTED")}>
          <ClipboardCheck aria-hidden="true" size={14} />
          Контакт
        </Button>
        <Button type="button" size="sm" disabled={disabled || isSubmitting} onClick={() => submitFromButton("TRIAL_ATTENDED")}>
          Пришёл
        </Button>
        <Button type="button" variant="danger" size="sm" disabled={disabled || isSubmitting} onClick={() => submitFromButton("TRIAL_NO_SHOW")}>
          Не пришёл
        </Button>
        {message ? <span className="text-xs font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
