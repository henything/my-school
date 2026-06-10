"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Loader2, MessageSquare, Phone, UserRoundCheck, UserRoundX } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type AttendanceStatus = "NOT_MARKED" | "PRESENT" | "ABSENT_UNEXCUSED" | "ABSENT_SICK_PENDING";

type Child = {
  id: string;
  fullName: string;
  age: number | null;
  medicalNotes: string | null;
  coachComment: string | null;
  adminComment: string | null;
  admissionStatus: string;
  parent: {
    fullName: string | null;
    phone: string | null;
    vkProfileUrl: string | null;
  } | null;
  attendance: {
    status: AttendanceStatus;
    comment: string | null;
  };
};

type AttendanceFormProps = {
  lessonId: string;
  lessonChildren: Child[];
};

const statusOptions: Array<{ value: AttendanceStatus; label: string; icon: typeof UserRoundCheck; tone: string }> = [
  { value: "PRESENT", label: "Был", icon: UserRoundCheck, tone: "border-[#2f7d32] bg-[#eef7ef] text-[#235d27]" },
  { value: "ABSENT_UNEXCUSED", label: "Пропуск", icon: UserRoundX, tone: "border-[#b3261e] bg-[#fff1ef] text-[#8f1f18]" },
  { value: "ABSENT_SICK_PENDING", label: "Болеет", icon: FileText, tone: "border-[#b7791f] bg-[#fff8e8] text-[#7a5114]" },
  { value: "NOT_MARKED", label: "Не отмечен", icon: MessageSquare, tone: "border-[var(--line)] bg-white text-[var(--muted)]" }
];

export function AttendanceForm({ lessonId, lessonChildren }: AttendanceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState(() =>
    Object.fromEntries(
      lessonChildren.map((child) => [
        child.id,
        {
          status: child.attendance.status,
          comment: child.attendance.comment ?? ""
        }
      ])
    ) as Record<string, { status: AttendanceStatus; comment: string }>
  );
  const markedCount = useMemo(
    () => Object.values(records).filter((record) => record.status !== "NOT_MARKED").length,
    [records]
  );

  function setStatus(childId: string, status: AttendanceStatus) {
    setRecords((current) => ({
      ...current,
      [childId]: {
        ...current[childId],
        status
      }
    }));
  }

  function setComment(childId: string, comment: string) {
    setRecords((current) => ({
      ...current,
      [childId]: {
        ...current[childId],
        comment
      }
    }));
  }

  async function onSubmit() {
    setMessage("");
    const response = await fetch(`/api/coach/lessons/${lessonId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: lessonChildren.map((child) => ({
          childId: child.id,
          status: records[child.id]?.status ?? "NOT_MARKED",
          comment: records[child.id]?.comment ?? ""
        }))
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "Не удалось сохранить табель.");
      return;
    }

    setMessage("Табель сохранён.");
    startTransition(() => router.refresh());
  }

  if (lessonChildren.length === 0) {
    return <p className="panel p-5 text-sm text-[var(--muted)]">В группе нет активных детей.</p>;
  }

  return (
    <section className="grid gap-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-semibold text-[var(--muted)]">Отмечено</div>
          <div className="text-xl font-bold">
            {markedCount}/{lessonChildren.length}
          </div>
        </div>
        <Button type="button" onClick={onSubmit} disabled={isPending}>
          {isPending ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Сохранить табель
        </Button>
        {message ? <div className="w-full text-sm font-semibold text-[var(--muted)]">{message}</div> : null}
      </div>

      {lessonChildren.map((child) => {
        const record = records[child.id] ?? { status: "NOT_MARKED", comment: "" };
        const isNotAdmitted = child.admissionStatus === "NOT_ADMITTED";

        return (
          <article
            key={child.id}
            className={cn(
              "panel grid gap-4 p-4",
              isNotAdmitted ? "border-[#b3261e] bg-[#fff8f7]" : "bg-white"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{child.fullName}</h2>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                  {child.age !== null ? <span>{child.age} лет</span> : null}
                  <span>{child.admissionStatus}</span>
                </div>
              </div>
              {isNotAdmitted ? (
                <div className="inline-flex items-center gap-1 rounded-full bg-[#b3261e] px-3 py-1 text-xs font-bold text-white">
                  <AlertTriangle aria-hidden="true" size={14} />
                  Не допускать
                </div>
              ) : null}
            </div>

            <div className="grid gap-2 text-sm text-[var(--muted)]">
              {child.medicalNotes ? <InfoLine label="Медицина" value={child.medicalNotes} strong /> : null}
              {child.adminComment ? <InfoLine label="Админ" value={child.adminComment} /> : null}
              {child.coachComment ? <InfoLine label="Тренер" value={child.coachComment} /> : null}
              {child.parent ? (
                <div className="flex flex-wrap gap-2">
                  {child.parent.phone ? (
                    <a className="inline-flex items-center gap-1 font-semibold text-[var(--accent-strong)]" href={`tel:${child.parent.phone}`}>
                      <Phone aria-hidden="true" size={14} />
                      {child.parent.phone}
                    </a>
                  ) : null}
                  {child.parent.vkProfileUrl ? (
                    <a className="font-semibold text-[var(--accent-strong)]" href={child.parent.vkProfileUrl} target="_blank" rel="noreferrer">
                      VK
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                const selected = record.status === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold",
                      selected ? option.tone : "border-[var(--line)] bg-white text-[var(--muted)]"
                    )}
                    onClick={() => setStatus(child.id, option.value)}
                  >
                    <Icon aria-hidden="true" size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <label className="label">
              Комментарий
              <input
                className="field"
                value={record.comment}
                onChange={(event) => setComment(child.id, event.target.value)}
                placeholder="Комментарий к отметке"
              />
            </label>
          </article>
        );
      })}
    </section>
  );
}

function InfoLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-[var(--line)] px-3 py-2", strong ? "bg-[#fff8e8] text-[#7a5114]" : "bg-[#f8faf8]")}>
      <span className="font-bold">{label}: </span>
      {value}
    </div>
  );
}
