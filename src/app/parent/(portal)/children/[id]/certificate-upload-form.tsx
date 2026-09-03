"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PendingSickness = {
  id: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  group: { id: string; name: string };
};

type CertificateUploadFormProps = {
  childId: string;
  pendingSickness: PendingSickness[];
};

export function CertificateUploadForm({ childId, pendingSickness }: CertificateUploadFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("childId", childId);

    try {
      const response = await fetch("/api/medical-certificates", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось загрузить справку.");
      }

      form.reset();
      setMessage("Справка отправлена на проверку.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить справку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4 border-b border-[var(--line)] p-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="label">
          Период с
          <input className="field" name="periodStart" type="date" required />
        </label>
        <label className="label">
          Период по
          <input className="field" name="periodEnd" type="date" required />
        </label>
      </div>

      <label className="label">
        Привязать к болезни
        <select className="field" name="attendanceRecordId">
          <option value="">Без привязки</option>
          {pendingSickness.map((record) => (
            <option key={record.id} value={record.id}>
              {record.lessonDate} · {record.startTime}-{record.endTime} · {record.group.name}
            </option>
          ))}
        </select>
      </label>

      <label className="label">
        Файл справки
        <input className="field" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
      </label>

      <label className="label">
        Комментарий
        <input className="field" name="comment" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <FileUp aria-hidden="true" size={16} />}
          Отправить
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}
