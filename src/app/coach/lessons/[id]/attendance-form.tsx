"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Loader2, MessageSquare, Phone, ShieldAlert, UserRoundCheck, UserRoundX } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

type AttendanceStatus = "NOT_MARKED" | "PRESENT" | "ABSENT_UNEXCUSED" | "ABSENT_SICK_PENDING" | "ABSENT_QUARANTINE";

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
  adminMode?: boolean;
  extraChildren?: Child[];
};

type CorrectionPreview = {
  revision: string;
  changes: Array<{ subscriptionId: string; childName: string; period: string; invoiceNumber: string | null; invoiceStatus: string | null;
    previousLessonsCount: number; nextLessonsCount: number; previousInvoiceAmountKopeks: number | null; nextInvoiceAmountKopeks: number;
    addedLessonDates: string[] | null; removedLessonDates: string[] | null; canApply: boolean; canApplyPaid: boolean;
    blockReason: string | null; paidDifferenceKopeks: number }>;
  childrenWithoutSubscription: string[];
};

const money = (kopeks: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(kopeks / 100);

const statusOptions: Array<{ value: AttendanceStatus; label: string; icon: typeof UserRoundCheck; tone: string }> = [
  { value: "PRESENT", label: "Был", icon: UserRoundCheck, tone: "border-[var(--brand-green)] bg-[var(--green-soft)] text-[var(--success-strong)]" },
  { value: "ABSENT_UNEXCUSED", label: "Пропуск", icon: UserRoundX, tone: "border-[var(--danger)] bg-[var(--red-soft)] text-[var(--danger-strong)]" },
  { value: "ABSENT_SICK_PENDING", label: "Болеет", icon: FileText, tone: "border-[var(--brand-yellow)] bg-[var(--yellow-soft)] text-[var(--warning-strong)]" },
  { value: "ABSENT_QUARANTINE", label: "Карантин", icon: ShieldAlert, tone: "border-[var(--brand-yellow)] bg-[var(--yellow-soft)] text-[var(--warning-strong)]" },
  { value: "NOT_MARKED", label: "Не отмечен", icon: MessageSquare, tone: "border-[var(--line)] bg-white text-[var(--muted)]" }
];

export function AttendanceForm({ lessonId, lessonChildren, adminMode = false, extraChildren = [] }: AttendanceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionPreview, setCorrectionPreview] = useState<CorrectionPreview | null>(null);
  const [paidDifferenceAction, setPaidDifferenceAction] = useState<"CREDIT" | "REFUND_DUE">("CREDIT");
  const [saving, setSaving] = useState(false);
  const [addedChildIds, setAddedChildIds] = useState<string[]>([]);
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
  const displayedChildren = useMemo(
    () => [...lessonChildren, ...extraChildren.filter((child) => addedChildIds.includes(child.id))],
    [lessonChildren, extraChildren, addedChildIds]
  );

  function addChild(childId: string) {
    if (!childId || addedChildIds.includes(childId)) return;
    setCorrectionPreview(null);
    setAddedChildIds((current) => [...current, childId]);
    setRecords((current) => ({ ...current, [childId]: { status: "NOT_MARKED", comment: "" } }));
  }

  function setStatus(childId: string, status: AttendanceStatus) {
    setCorrectionPreview(null);
    setRecords((current) => ({
      ...current,
      [childId]: {
        ...current[childId],
        status
      }
    }));
  }

  function setComment(childId: string, comment: string) {
    setCorrectionPreview(null);
    setRecords((current) => ({
      ...current,
      [childId]: {
        ...current[childId],
        comment
      }
    }));
  }

  function markRemainingAbsent() {
    setCorrectionPreview(null);
    setRecords((current) => Object.fromEntries(Object.entries(current).map(([childId, record]) => [
      childId,
      record.status === "NOT_MARKED" ? { ...record, status: "ABSENT_UNEXCUSED" as const } : record
    ])));
  }

  async function onSubmit() {
    setMessage("");
    if (adminMode && !correctionReason.trim()) {
      setMessage("Укажите причину исправления табеля.");
      return;
    }
    setSaving(true);
    const response = await fetch(adminMode ? `/api/admin/lessons/${lessonId}/attendance` : `/api/coach/lessons/${lessonId}/attendance`, {
      method: adminMode && !correctionPreview ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correctionReason: adminMode ? correctionReason.trim() : undefined,
        expectedRevision: correctionPreview?.revision,
        paidDifferenceAction: correctionPreview?.changes.some((change) => change.canApplyPaid) ? paidDifferenceAction : undefined,
        records: displayedChildren.map((child) => ({
          childId: child.id,
          status: records[child.id]?.status ?? "NOT_MARKED",
          comment: records[child.id]?.comment ?? ""
        }))
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; preview?: CorrectionPreview; financialChanges?: number; childrenWithoutSubscription?: string[] };
    setSaving(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Не удалось сохранить табель.");
      return;
    }

    if (adminMode && !correctionPreview) {
      setCorrectionPreview(payload.preview ?? null);
      setMessage("Проверьте изменения табеля и сумм перед сохранением.");
      return;
    }
    setCorrectionPreview(null);
    setMessage(adminMode ? `Табель сохранён. Пересчитано счетов: ${payload.financialChanges ?? 0}.${payload.childrenWithoutSubscription?.length ? " Нет абонемента: " + payload.childrenWithoutSubscription.join(", ") + "." : ""}` : "Табель сохранён.");
    startTransition(() => router.refresh());
  }

  if (lessonChildren.length === 0 && !adminMode) {
    return <p className="panel p-5 text-sm text-[var(--muted)]">В группе нет активных детей.</p>;
  }

  return (
    <section className="grid gap-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-semibold text-[var(--muted)]">Отмечено</div>
          <div className="text-xl font-extrabold">
            {markedCount}/{displayedChildren.length}
          </div>
        </div>
        <Button type="button" onClick={onSubmit} disabled={isPending || saving || Boolean(correctionPreview?.changes.some((change) => !change.canApply && !change.canApplyPaid))}>
          {isPending || saving ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          {adminMode && !correctionPreview ? "Проверить исправление" : "Сохранить табель"}
        </Button>
        {message ? <div className="w-full text-sm font-semibold text-[var(--muted)]">{message}</div> : null}
        {adminMode ? (
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <label className="label">
              Причина исправления
              <input className="field" value={correctionReason} onChange={(event) => { setCorrectionReason(event.target.value); setCorrectionPreview(null); }} required placeholder="Например, уточнили посещение у тренера" />
            </label>
            <label className="label">
              Добавить ребёнка из группы
              <select className="field" value="" onChange={(event) => addChild(event.target.value)}>
                <option value="">Выбрать ребёнка</option>
                {extraChildren.filter((child) => !addedChildIds.includes(child.id)).map((child) => (
                  <option key={child.id} value={child.id}>{child.fullName}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Button type="button" variant="secondary" onClick={markRemainingAbsent}>Остальные отсутствовали</Button>
              <p className="mt-1 text-xs text-[var(--muted)]">Только дети из состава группы на дату занятия. Уже отмеченные дети не изменятся.</p>
            </div>
          </div>
        ) : null}
        {adminMode && correctionPreview ? <div className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm">
          <div className="font-bold">Предварительный расчёт</div>
          {correctionPreview.changes.length === 0 ? <p>Суммы счетов и число занятий не меняются.</p> : correctionPreview.changes.map((change) => <div key={change.subscriptionId} className="mt-2 border-t border-[var(--line)] pt-2">
            <div className="font-bold">{change.childName} · {change.period} · счёт {change.invoiceNumber ?? "не выставлен"}</div>
            <div>Занятий: {change.previousLessonsCount} → {change.nextLessonsCount}. Счёт: {money(change.previousInvoiceAmountKopeks ?? 0)} → {money(change.nextInvoiceAmountKopeks)}.</div>
            {change.addedLessonDates?.length ? <div>Добавлены: {change.addedLessonDates.join(", ")}</div> : null}
            {change.removedLessonDates?.length ? <div>Исключены: {change.removedLessonDates.join(", ")}</div> : null}
            {change.canApplyPaid ? <div>Оплаченный счёт остаётся прежним. Разница {money(change.paidDifferenceKopeks)} оформится отдельным зачётом или суммой к возврату.</div> : null}
            {!change.canApply && !change.canApplyPaid ? <div className="font-semibold text-[var(--danger-strong)]">{change.blockReason ?? "Нужна ручная проверка счёта."}</div> : null}
          </div>)}
          {correctionPreview.changes.some((change) => change.canApplyPaid) ? <label className="label mt-3">Разница по оплаченному счёту<select className="field" value={paidDifferenceAction} onChange={(event) => setPaidDifferenceAction(event.target.value as "CREDIT" | "REFUND_DUE")}><option value="CREDIT">Зачесть в следующем месяце</option><option value="REFUND_DUE">Зафиксировать сумму к возврату</option></select></label> : null}
          {correctionPreview.childrenWithoutSubscription.length ? <p className="mt-2 font-semibold text-[var(--warning-strong)]">Нет абонемента за дату занятия: {correctionPreview.childrenWithoutSubscription.join(", ")}. После сохранения проверьте выставление счёта.</p> : null}
        </div> : null}
      </div>

      {displayedChildren.map((child) => {
        const record = records[child.id] ?? { status: "NOT_MARKED", comment: "" };
        const isNotAdmitted = child.admissionStatus === "NOT_ADMITTED";

        return (
          <article
            key={child.id}
            className={cn(
              "panel grid gap-4 p-4",
              isNotAdmitted ? "border-[var(--danger)] bg-[var(--red-soft)]" : "bg-white"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">{child.fullName}</h2>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                  {child.age !== null ? <span>{child.age} лет</span> : null}
                  <span>{labelForEnum(child.admissionStatus)}</span>
                </div>
              </div>
              {isNotAdmitted ? (
                <div className="inline-flex items-center gap-1 rounded-full bg-[var(--danger)] px-3 py-1 text-xs font-extrabold text-white">
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                const selected = record.status === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-extrabold transition",
                      selected ? option.tone : "border-[var(--line)] bg-white text-[var(--muted)] hover:bg-[var(--blue-soft)]"
                    )}
                    onClick={() => setStatus(child.id, option.value)}
                  >
                    <Icon aria-hidden="true" size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {record.status === "ABSENT_QUARANTINE" ? (
              <p className="text-sm font-semibold text-[var(--warning-strong)]">
                {adminMode
                  ? "Карантин исключит занятие из оплаты. После проверки расчёта выберите зачёт или сумму к возврату по оплаченному счёту."
                  : "Карантин исключит занятие из оплаты. Неоплаченный счёт пересчитается, по оплаченному создастся зачёт на следующий месяц."}
              </p>
            ) : null}

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
    <div className={cn("rounded-lg border border-[var(--line)] px-3 py-2", strong ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]" : "bg-[var(--panel-soft)]")}>
      <span className="font-bold">{label}: </span>
      {value}
    </div>
  );
}
