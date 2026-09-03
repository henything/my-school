"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarRange, CheckCircle2, FileCheck2, FileText, FileUp, Loader2, RefreshCcw, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelForEnum } from "@/lib/labels";

type Child = {
  id: string;
  fullName: string;
  status: string;
  cachedMakeupBalance: number;
  currentGroup: { id: string; name: string } | null;
};

type Group = {
  id: string;
  name: string;
  status: string;
};

type Lesson = {
  id: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  status: string;
  group: { id: string; name: string };
};

type PendingSickness = {
  id: string;
  markedAt: string | null;
  child: { id: string; fullName: string };
  lesson: {
    id: string;
    lessonDate: string;
    startTime: string;
    endTime: string;
    group: { id: string; name: string };
  };
};

type Makeup = {
  id: string;
  reason: string;
  status: string;
  assignedDate: string | null;
  comment: string | null;
  createdAt: string;
  child: { id: string; fullName: string; cachedMakeupBalance: number; currentGroup: { id: string; name: string } | null };
  group: { id: string; name: string };
  sourceLesson: { id: string; lessonDate: string; startTime: string; endTime: string } | null;
  assignedLesson: { id: string; lessonDate: string; startTime: string; endTime: string } | null;
  groupEvent: { id: string; reason: string; periodStart: string; periodEnd: string } | null;
};

type GroupEvent = {
  id: string;
  group: { id: string; name: string };
  reason: string;
  periodStart: string;
  periodEnd: string;
  makeupCount: number;
  comment: string | null;
  createdAt: string;
};

type MedicalCertificate = {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  originalFileName: string;
  comment: string | null;
  adminComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  child: { id: string; fullName: string; currentGroup: { id: string; name: string } | null };
  attendanceRecord: {
    id: string;
    lesson: {
      id: string;
      lessonDate: string;
      startTime: string;
      endTime: string;
      group: { id: string; name: string };
    };
  } | null;
  uploadedBy: { id: string; displayName: string; role: string };
  reviewedBy: { id: string; displayName: string; role: string } | null;
};

type MakeupFormsProps = {
  childOptions: Child[];
  groups: Group[];
  lessons: Lesson[];
  makeups: Makeup[];
  pendingSickness: PendingSickness[];
  groupEvents: GroupEvent[];
  certificates: MedicalCertificate[];
};

const finalStatuses = [
  ["ABSENT_SICK_CONFIRMED", "Болезнь подтверждена"],
  ["ABSENT_UNEXCUSED_FINAL", "Неуважительный пропуск"]
] as const;

const groupEventReasons = [
  ["QUARANTINE", "Карантин"],
  ["KINDERGARTEN_EVENT", "Мероприятие сада"],
  ["RUSSIAN_HOLIDAY", "Праздник"],
  ["COACH_UNAVAILABLE", "Тренер недоступен"],
  ["GROUP_TRANSFER", "Перевод группы"],
  ["OTHER", "Другое"]
] as const;

const makeupColumns = [
  ["AVAILABLE", "Доступны"],
  ["ASSIGNED", "Назначены"],
  ["USED", "Использованы"],
  ["REFUNDED", "Возврат"],
  ["CANCELLED", "Отменены"]
] as const;

async function submitJson<T = unknown>(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "Не удалось сохранить.");
  }

  return payload;
}

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function nullableText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function MakeupForms({ childOptions, groups, lessons, makeups, pendingSickness, groupEvents, certificates }: MakeupFormsProps) {
  const activeChildren = childOptions.filter((child) => child.status !== "ARCHIVED" && child.currentGroup);
  const certificateChildren = childOptions.filter((child) => child.status !== "ARCHIVED");
  const activeGroups = groups.filter((group) => group.status !== "ARCHIVED");
  const assignableLessons = lessons.filter((lesson) => lesson.status !== "CANCELLED");

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <FinalizeSicknessForm pendingSickness={pendingSickness} />
        <VacationForm childOptions={activeChildren} />
        <GroupEventForm groups={activeGroups} />
        <SicknessFollowUpForm />
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Ожидают финализации болезни</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Файлы справок и заявлений не хранятся в системе.</p>
          </div>
          <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{pendingSickness.length}</span>
        </div>
        <div className="mt-4 table-shell">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Ребёнок</th>
                <th>Группа</th>
                <th>Занятие</th>
                <th>С момента отметки</th>
              </tr>
            </thead>
            <tbody>
              {pendingSickness.map((record) => (
                <tr key={record.id}>
                  <td className="font-semibold">{record.child.fullName}</td>
                  <td>{record.lesson.group.name}</td>
                  <td>
                    {record.lesson.lessonDate} {record.lesson.startTime}-{record.lesson.endTime}
                  </td>
                  <td>{record.markedAt ? new Date(record.markedAt).toLocaleDateString("ru-RU") : "—"}</td>
                </tr>
              ))}
              {pendingSickness.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--muted)]">
                    Нет болезней в ожидании.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <MedicalCertificatePanel certificates={certificates} childOptions={certificateChildren} pendingSickness={pendingSickness} />
      <MakeupBoard makeups={makeups} lessons={assignableLessons} />
      <GroupEventsTable groupEvents={groupEvents} />
    </section>
  );
}

function MedicalCertificatePanel({
  certificates,
  childOptions,
  pendingSickness
}: {
  certificates: MedicalCertificate[];
  childOptions: Child[];
  pendingSickness: PendingSickness[];
}) {
  const pendingCount = certificates.filter((certificate) => certificate.status === "PENDING").length;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileText aria-hidden="true" size={18} />
            Справки
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Одобрение привязанной справки подтверждает болезнь и создаёт перенос.</p>
        </div>
        <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{pendingCount}</span>
      </div>
      <AdminCertificateUploadForm childOptions={childOptions} pendingSickness={pendingSickness} />
      <div className="mt-4 table-shell">
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>Ребёнок</th>
              <th>Период</th>
              <th>Статус</th>
              <th>Файл</th>
              <th>Болезнь</th>
              <th>Решение</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((certificate) => (
              <tr key={certificate.id}>
                <td>
                  <div className="font-semibold">{certificate.child.fullName}</div>
                  <div className="text-sm text-[var(--muted)]">{certificate.child.currentGroup?.name ?? "Без группы"}</div>
                </td>
                <td>
                  {certificate.periodStart} - {certificate.periodEnd}
                </td>
                <td>
                  <StatusBadgeLabel status={certificate.status} />
                </td>
                <td>
                  <a className="font-semibold text-[var(--accent-strong)]" href={`/api/medical-certificates/${certificate.id}/file`} target="_blank">
                    {certificate.originalFileName}
                  </a>
                  {certificate.comment ? <div className="mt-1 text-sm text-[var(--muted)]">{certificate.comment}</div> : null}
                </td>
                <td>{certificate.attendanceRecord ? formatLesson(certificate.attendanceRecord.lesson) : "—"}</td>
                <td>
                  {certificate.status === "PENDING" ? (
                    <CertificateReviewControls certificate={certificate} />
                  ) : (
                    <div className="text-sm text-[var(--muted)]">
                      {certificate.adminComment ?? "—"}
                      {certificate.reviewedAt ? <div>{new Date(certificate.reviewedAt).toLocaleString("ru-RU")}</div> : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {certificates.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-[var(--muted)]">
                  Справок пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminCertificateUploadForm({ childOptions, pendingSickness }: { childOptions: Child[]; pendingSickness: PendingSickness[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = childOptions.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const attendanceRecordId = String(formData.get("attendanceRecordId") ?? "");
    const sickness = pendingSickness.find((record) => record.id === attendanceRecordId);

    if (sickness) {
      formData.set("childId", sickness.child.id);
    }

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
      setMessage("Справка загружена и ждёт решения.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить справку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-4 grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4" onSubmit={onSubmit}>
      <h3 className="flex items-center gap-2 font-bold">
        <FileUp aria-hidden="true" size={16} />
        Прикрепить справку
      </h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="label">
          Ребёнок
          <select className="field" name="childId" required disabled={disabled}>
            <option value="">Выбрать</option>
            {childOptions.map((child) => (
              <option key={child.id} value={child.id}>
                {child.fullName} · {child.currentGroup?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Привязать к болезни
          <select className="field" name="attendanceRecordId" disabled={pendingSickness.length === 0}>
            <option value="">Без привязки</option>
            {pendingSickness.map((record) => (
              <option key={record.id} value={record.id}>
                {record.child.fullName} · {record.lesson.group.name} · {record.lesson.lessonDate}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="label">
          Период с
          <input className="field" name="periodStart" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Период по
          <input className="field" name="periodEnd" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Файл
          <input className="field" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Загрузить
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </form>
  );
}

function CertificateReviewControls({ certificate }: { certificate: MedicalCertificate }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function review(status: "APPROVED" | "REJECTED") {
    setMessage("");
    setIsSubmitting(true);

    try {
      await submitJson(`/api/admin/medical-certificates/${certificate.id}/review`, {
        status,
        adminComment: nullableText(adminComment)
      });
      setAdminComment("");
      setMessage(status === "APPROVED" ? "Одобрено." : "Отклонено.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-w-[220px] gap-2">
      <input
        className="field min-h-9"
        value={adminComment}
        onChange={(event) => setAdminComment(event.target.value)}
        placeholder="Комментарий"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void review("APPROVED")} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <CheckCircle2 aria-hidden="true" size={14} />}
          Одобрить
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void review("REJECTED")} disabled={isSubmitting}>
          <XCircle aria-hidden="true" size={14} />
          Отклонить
        </Button>
      </div>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}

function FinalizeSicknessForm({ pendingSickness }: { pendingSickness: PendingSickness[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = pendingSickness.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson(`/api/attendance/${formData.get("attendanceRecordId")}/finalize`, {
        finalStatus: formData.get("finalStatus"),
        comment: nullable(formData.get("comment"))
      });
      form.reset();
      setMessage("Статус финализирован.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileCheck2 aria-hidden="true" size={18} />
        Болезнь
      </h2>
      <label className="label">
        Запись
        <select className="field" name="attendanceRecordId" required disabled={disabled}>
          <option value="">Выбрать</option>
          {pendingSickness.map((record) => (
            <option key={record.id} value={record.id}>
              {record.child.fullName} · {record.lesson.group.name} · {record.lesson.lessonDate}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Решение
        <select className="field" name="finalStatus" required disabled={disabled}>
          {finalStatuses.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Финализировать" disabled={disabled} />
    </form>
  );
}

function VacationForm({ childOptions }: { childOptions: Child[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = childOptions.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const payload = await submitJson<{ result: { lessonCount: number; makeupCount: number } }>(
        `/api/children/${formData.get("childId")}/vacations`,
        {
          periodStart: formData.get("periodStart"),
          periodEnd: formData.get("periodEnd"),
          comment: nullable(formData.get("comment"))
        }
      );
      form.reset();
      setMessage(`Занятий: ${payload.result.lessonCount}. Переносов: ${payload.result.makeupCount}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarRange aria-hidden="true" size={18} />
        Отпуск
      </h2>
      <label className="label">
        Ребёнок
        <select className="field" name="childId" required disabled={disabled}>
          <option value="">Выбрать</option>
          {childOptions.map((child) => (
            <option key={child.id} value={child.id}>
              {child.fullName} · {child.currentGroup?.name} · переносы {child.cachedMakeupBalance}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Начало
          <input className="field" name="periodStart" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Конец
          <input className="field" name="periodEnd" type="date" required disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Оформить" disabled={disabled} />
    </form>
  );
}

function GroupEventForm({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = groups.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const payload = await submitJson<{ result: { lessonCount: number; childCount: number; makeupCount: number } }>("/api/group-events", {
        groupId: formData.get("groupId"),
        reason: formData.get("reason"),
        periodStart: formData.get("periodStart"),
        periodEnd: formData.get("periodEnd"),
        comment: nullable(formData.get("comment"))
      });
      form.reset();
      setMessage(`Занятий: ${payload.result.lessonCount}. Детей: ${payload.result.childCount}. Переносов: ${payload.result.makeupCount}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <ShieldAlert aria-hidden="true" size={18} />
        Событие группы
      </h2>
      <label className="label">
        Группа
        <select className="field" name="groupId" required disabled={disabled}>
          <option value="">Выбрать</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Причина
        <select className="field" name="reason" required disabled={disabled}>
          {groupEventReasons.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Начало
          <input className="field" name="periodStart" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Конец
          <input className="field" name="periodEnd" type="date" required disabled={disabled} />
        </label>
      </div>
      <label className="label">
        Комментарий
        <input className="field" name="comment" minLength={1} required disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Применить" disabled={disabled} />
    </form>
  );
}

function SicknessFollowUpForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const payload = await submitJson<{ result: { checkedCount: number; createdTaskCount: number } }>("/api/jobs/sickness-follow-up-check", {});
      setMessage(`Проверено: ${payload.result.checkedCount}. Задач: ${payload.result.createdTaskCount}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить проверку.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel grid content-start gap-4 p-5" onSubmit={onSubmit}>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarCheck2 aria-hidden="true" size={18} />
        Follow-up
      </h2>
      <p className="text-sm text-[var(--muted)]">Задачи создаются для болезней старше 7 дней без финального решения.</p>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Запустить" />
    </form>
  );
}

function MakeupBoard({ makeups, lessons }: { makeups: Makeup[]; lessons: Lesson[] }) {
  const byStatus = useMemo(() => {
    const map = new Map<string, Makeup[]>();

    for (const [status] of makeupColumns) {
      map.set(status, []);
    }

    for (const makeup of makeups) {
      map.set(makeup.status, [...(map.get(makeup.status) ?? []), makeup]);
    }

    return map;
  }, [makeups]);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Борд переносов</h2>
        <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{makeups.length}</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        {makeupColumns.map(([status, label]) => {
          const items = byStatus.get(status) ?? [];

          return (
            <div key={status} className="panel min-w-0 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">{label}</h3>
                <span className="badge bg-[var(--blue-soft)] text-[var(--muted)]">{items.length}</span>
              </div>
              <div className="mt-4 grid gap-3">
                {items.map((makeup) => (
                  <MakeupCard key={makeup.id} makeup={makeup} lessons={lessons.filter((lesson) => lesson.group.id === makeup.group.id)} />
                ))}
                {items.length === 0 ? <p className="text-sm text-[var(--muted)]">Пусто</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MakeupCard({ makeup, lessons }: { makeup: Makeup; lessons: Lesson[] }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={badgeClass(makeup.status)}>{labelForEnum(makeup.status)}</span>
        <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{labelForEnum(makeup.reason)}</span>
      </div>
      <h4 className="mt-3 font-bold">{makeup.child.fullName}</h4>
      <p className="mt-1 text-sm text-[var(--muted)]">{makeup.group.name}</p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-[var(--muted)]">Источник</dt>
          <dd className="font-semibold">{makeup.sourceLesson ? formatLesson(makeup.sourceLesson) : makeup.groupEvent?.reason ? labelForEnum(makeup.groupEvent.reason) : "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Назначение</dt>
          <dd className="font-semibold">{makeup.assignedLesson ? formatLesson(makeup.assignedLesson) : makeup.assignedDate ?? "—"}</dd>
        </div>
      </dl>
      {makeup.comment ? <p className="mt-3 text-sm text-[var(--muted)]">{makeup.comment}</p> : null}
      {makeup.status === "AVAILABLE" ? <AssignMakeupForm makeup={makeup} lessons={lessons} /> : null}
      {makeup.status === "ASSIGNED" ? <CloseMakeupButtons makeup={makeup} /> : null}
      {makeup.status === "AVAILABLE" ? <CloseMakeupButtons makeup={makeup} compact /> : null}
    </article>
  );
}

function AssignMakeupForm({ makeup, lessons }: { makeup: Makeup; lessons: Lesson[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = lessons.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await submitJson(`/api/makeups/${makeup.id}/assign`, {
        assignedLessonId: formData.get("assignedLessonId"),
        comment: nullable(formData.get("comment"))
      });
      setMessage("Назначено.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось назначить.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
      <label className="label">
        Занятие
        <select className="field" name="assignedLessonId" required disabled={disabled}>
          <option value="">Выбрать</option>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.lessonDate} {lesson.startTime}-{lesson.endTime}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Комментарий
        <input className="field" name="comment" minLength={1} required disabled={disabled} />
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Назначить" disabled={disabled} />
    </form>
  );
}

function CloseMakeupButtons({ makeup, compact = false }: { makeup: Makeup; compact?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = comment.trim().length > 0 && !isSubmitting;

  async function close(status: "USED" | "REFUNDED" | "CANCELLED") {
    setMessage("");
    setIsSubmitting(true);

    try {
      await submitJson(`/api/makeups/${makeup.id}/use`, { status, comment });
      setMessage(labelForEnum(status));
      setComment("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось закрыть.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={compact ? "mt-3 grid gap-2" : "mt-4 grid gap-2"}>
      <input
        className="field min-h-9"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Комментарий"
        minLength={1}
        required
      />
      <div className="flex flex-wrap gap-2">
        {!compact ? (
          <Button type="button" size="sm" onClick={() => void close("USED")} disabled={!canSubmit}>
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <RefreshCcw aria-hidden="true" size={14} />}
            Использован
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => void close("REFUNDED")} disabled={!canSubmit}>
          Возврат
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void close("CANCELLED")} disabled={!canSubmit}>
          Отмена
        </Button>
      </div>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}

function GroupEventsTable({ groupEvents }: { groupEvents: GroupEvent[] }) {
  return (
    <section className="panel">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-lg font-bold">Групповые события</h2>
      </div>
      <div className="table-shell">
        <table className="data-table min-w-[860px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Группа</th>
              <th>Причина</th>
              <th>Период</th>
              <th>Переносы</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {groupEvents.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString("ru-RU")}</td>
                <td className="font-semibold">{event.group.name}</td>
                <td>{labelForEnum(event.reason)}</td>
                <td>
                  {event.periodStart} - {event.periodEnd}
                </td>
                <td className="font-semibold">{event.makeupCount}</td>
                <td>{event.comment ?? "—"}</td>
              </tr>
            ))}
            {groupEvents.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-[var(--muted)]">
                  Групповых событий пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FormFooter({ isSubmitting, message, label, disabled = false }: { isSubmitting: boolean; message: string; label: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
        {label}
      </Button>
      {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
    </div>
  );
}

function StatusBadgeLabel({ status }: { status: string }) {
  const className =
    status === "APPROVED"
      ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
      : status === "REJECTED"
        ? "bg-[var(--red-soft)] text-[var(--danger-strong)]"
        : "bg-[var(--yellow-soft)] text-[var(--warning-strong)]";

  return <span className={`badge ${className}`}>{labelForEnum(status)}</span>;
}

function formatLesson(lesson: { lessonDate: string; startTime: string; endTime: string }) {
  return `${lesson.lessonDate} ${lesson.startTime}-${lesson.endTime}`;
}

function badgeClass(status: string) {
  const className =
    status === "AVAILABLE"
      ? "bg-[var(--green-soft)] text-[var(--success-strong)]"
      : status === "ASSIGNED"
        ? "bg-[var(--blue-soft)] text-[var(--accent-strong)]"
        : status === "USED"
          ? "bg-[#ececec] text-[#555]"
          : status === "REFUNDED"
            ? "bg-[var(--yellow-soft)] text-[var(--warning-strong)]"
            : "bg-[var(--red-soft)] text-[var(--danger-strong)]";

  return `badge ${className}`;
}
