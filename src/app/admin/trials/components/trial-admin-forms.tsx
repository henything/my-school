"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type LessonOption = {
  id: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  status: string;
  group: { id: string; name: string };
  coach: { displayName: string };
};

type GroupOption = {
  id: string;
  name: string;
  status: string;
};

type Trial = {
  id: string;
  childName: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentVkUrl: string | null;
  status: string;
  groupId: string;
};

type CreateTrialFormProps = {
  lessons: LessonOption[];
};

type ConvertTrialFormProps = {
  trial: Trial;
  groups: GroupOption[];
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

export function CreateTrialForm({ lessons }: CreateTrialFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableLessons = lessons.filter((lesson) => lesson.status !== "CANCELLED");
  const disabled = availableLessons.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: formData.get("lessonId"),
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
        throw new Error(payload.error ?? "Не удалось создать пробника.");
      }

      form.reset();
      setMessage("Пробник создан.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать пробника.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <UserRoundPlus aria-hidden="true" size={18} />
        Новый пробник
      </h2>
      <label className="label">
        Занятие
        <select className="field" name="lessonId" required disabled={disabled}>
          <option value="">Выбрать</option>
          {availableLessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.lessonDate} {lesson.startTime}-{lesson.endTime} · {lesson.group.name} · {lesson.coach.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="label">
          Имя ребёнка
          <input className="field" name="childName" disabled={disabled} />
        </label>
        <label className="label">
          Возраст
          <input className="field" name="childAge" type="number" min="0" max="18" disabled={disabled} />
        </label>
        <label className="label">
          Источник
          <select className="field" name="source" defaultValue="UNKNOWN" disabled={disabled}>
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
          <input className="field" name="parentName" disabled={disabled} />
        </label>
        <label className="label">
          Телефон
          <input className="field" name="parentPhone" type="tel" inputMode="tel" placeholder="+7 999 123-45-67" pattern="[+0-9()\\s.-]{5,30}" disabled={disabled} />
        </label>
        <label className="label">
          VK
          <input className="field" name="parentVkUrl" disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

export function ConvertTrialForm({ trial, groups }: ConvertTrialFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = trial.status === "TRANSFERRED_TO_ADMIN" || trial.status === "CONVERTED_TO_ACTIVE";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/trials/${trial.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childFullName: nullable(formData.get("childFullName")),
          parentName: nullable(formData.get("parentName")),
          parentPhone: nullable(formData.get("parentPhone")),
          parentVkUrl: nullable(formData.get("parentVkUrl")),
          currentGroupId: formData.get("currentGroupId"),
          adminComment: nullable(formData.get("adminComment"))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось конвертировать пробника.");
      }

      setMessage("Пробник конвертирован.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось конвертировать пробника.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Ребёнок
          <input className="field" name="childFullName" defaultValue={trial.childName ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          Группа
          <select className="field" name="currentGroupId" defaultValue={trial.groupId} disabled={disabled}>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">
          Родитель
          <input className="field" name="parentName" defaultValue={trial.parentName ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          Телефон
          <input className="field" name="parentPhone" type="tel" inputMode="tel" placeholder="+7 999 123-45-67" pattern="[+0-9()\\s.-]{5,30}" defaultValue={trial.parentPhone ?? ""} disabled={disabled} />
        </label>
        <label className="label">
          VK
          <input className="field" name="parentVkUrl" defaultValue={trial.parentVkUrl ?? ""} disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий админа
        <input className="field" name="adminComment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Конвертировать" disabled={disabled} />
    </form>
  );
}

export function TransferTrialForm({ trialId, disabled }: { trialId: string; disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch(`/api/trials/${trialId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "TRANSFERRED_TO_ADMIN",
          comment: nullable(formData.get("comment"))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось закрыть обработку.");
      }

      setMessage("Обработка закрыта.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось закрыть обработку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Закрыть без конвертации" disabled={disabled} variant="secondary" />
    </form>
  );
}

function FormFooter({
  isSubmitting,
  message,
  label,
  disabled,
  variant = "primary"
}: {
  isSubmitting: boolean;
  message: string;
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={disabled || isSubmitting} variant={variant}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        {label}
      </Button>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}
