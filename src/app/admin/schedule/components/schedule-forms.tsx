"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarPlus, Loader2, Repeat2, UserCheck, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Group = {
  id: string;
  name: string;
  status: string;
  branch: { name: string };
  mainCoach: { id: string; displayName: string };
};

type Coach = {
  id: string;
  displayName: string;
  login: string;
  status: string;
};

type Lesson = {
  id: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  status: string;
  group: { name: string };
  coach: { displayName: string };
  substituteCoach: { id: string; displayName: string } | null;
};

type ScheduleFormsProps = {
  groups: Group[];
  coaches: Coach[];
  lessons: Lesson[];
};

const weekdays = [
  ["1", "Понедельник"],
  ["2", "Вторник"],
  ["3", "Среда"],
  ["4", "Четверг"],
  ["5", "Пятница"],
  ["6", "Суббота"],
  ["7", "Воскресенье"]
] as const;

const reasons = [
  ["QUARANTINE", "Карантин"],
  ["KINDERGARTEN_EVENT", "Мероприятие"],
  ["RUSSIAN_HOLIDAY", "Праздник"],
  ["COACH_UNAVAILABLE", "Тренер недоступен"],
  ["GROUP_TRANSFER", "Перевод группы"],
  ["OTHER", "Другое"]
] as const;

function nullable(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

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

export function ScheduleForms({ groups, coaches, lessons }: ScheduleFormsProps) {
  const activeGroups = groups.filter((group) => group.status !== "ARCHIVED");
  const activeCoaches = coaches.filter((coach) => coach.status === "ACTIVE");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <CreateTemplateForm groups={activeGroups} />
        <GenerateMonthForm groups={activeGroups} />
        <CreateLessonForm groups={activeGroups} coaches={activeCoaches} />
      </div>
      <LessonActions lessons={lessons} coaches={activeCoaches} />
    </div>
  );
}

function CreateTemplateForm({ groups }: { groups: Group[] }) {
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
      await submitJson("/api/schedule-templates", {
        groupId: formData.get("groupId"),
        weekday: formData.get("weekday"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime")
      });
      form.reset();
      setMessage("Шаблон создан.");
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
        <Repeat2 aria-hidden="true" size={18} />
        Шаблон
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
        День недели
        <select className="field" name="weekday" required disabled={disabled}>
          <option value="">Выбрать</option>
          {weekdays.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Начало
          <input className="field" name="startTime" type="time" required disabled={disabled} />
        </label>
        <label className="label">
          Окончание
          <input className="field" name="endTime" type="time" required disabled={disabled} />
        </label>
      </div>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function GenerateMonthForm({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const payload = await submitJson<{ result: { createdCount: number; skippedDuplicateCount: number } }>("/api/lessons/generate-month", {
        month: formData.get("month"),
        groupId: nullable(formData.get("groupId"))
      });
      setMessage(`Создано: ${payload.result.createdCount}. Дубли: ${payload.result.skippedDuplicateCount}.`);
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
        <WandSparkles aria-hidden="true" size={18} />
        Генерация месяца
      </h2>
      <label className="label">
        Месяц
        <input className="field" name="month" type="month" required />
      </label>
      <label className="label">
        Группа
        <select className="field" name="groupId">
          <option value="">Все активные шаблоны</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Сгенерировать" />
    </form>
  );
}

function CreateLessonForm({ groups, coaches }: { groups: Group[]; coaches: Coach[] }) {
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
      await submitJson("/api/lessons", {
        groupId: formData.get("groupId"),
        coachId: nullable(formData.get("coachId")),
        lessonDate: formData.get("lessonDate"),
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime")
      });
      form.reset();
      setMessage("Занятие создано.");
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
        <CalendarPlus aria-hidden="true" size={18} />
        Разовое занятие
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
        Тренер
        <select className="field" name="coachId" disabled={disabled}>
          <option value="">Основной тренер группы</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label sm:col-span-2">
          Дата
          <input className="field" name="lessonDate" type="date" required disabled={disabled} />
        </label>
        <label className="label">
          Начало
          <input className="field" name="startTime" type="time" required disabled={disabled} />
        </label>
        <label className="label">
          Конец
          <input className="field" name="endTime" type="time" required disabled={disabled} />
        </label>
      </div>
      <FormFooter isSubmitting={isSubmitting} message={message} label="Создать" disabled={disabled} />
    </form>
  );
}

function LessonActions({ lessons, coaches }: { lessons: Lesson[]; coaches: Coach[] }) {
  return (
    <section className="panel">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-lg font-bold">Действия с занятиями</h2>
      </div>
      <div className="table-shell">
        <table className="data-table min-w-[1180px]">
          <thead>
            <tr>
              <th>Занятие</th>
              <th>Статус</th>
              <th>Перенос</th>
              <th>Отмена</th>
              <th>Замена</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.id}>
                <td>
                  <div className="font-semibold">{lesson.group.name}</div>
                  <div className="text-sm text-[var(--muted)]">
                    {lesson.lessonDate} {lesson.startTime}-{lesson.endTime} · {lesson.coach.displayName}
                    {lesson.substituteCoach ? ` · замена: ${lesson.substituteCoach.displayName}` : ""}
                  </div>
                </td>
                <td className="font-semibold">{lesson.status}</td>
                <td>
                  <MoveLessonForm lesson={lesson} />
                </td>
                <td>
                  <CancelLessonForm lessonId={lesson.id} />
                </td>
                <td>
                  <SubstituteLessonForm lessonId={lesson.id} coaches={coaches} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MoveLessonForm({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    await submitJson(`/api/lessons/${lesson.id}/move`, {
      lessonDate: formData.get("lessonDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      reason: formData.get("reason"),
      comment: nullable(formData.get("comment"))
    }).catch(() => undefined);

    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="grid min-w-[300px] gap-2" onSubmit={onSubmit}>
      <div className="grid grid-cols-[1fr_84px_84px] gap-2">
        <input className="field min-h-9" name="lessonDate" type="date" defaultValue={lesson.lessonDate} required />
        <input className="field min-h-9" name="startTime" type="time" defaultValue={lesson.startTime} required />
        <input className="field min-h-9" name="endTime" type="time" defaultValue={lesson.endTime} required />
      </div>
      <div className="grid grid-cols-[1fr_1fr_40px] gap-2">
        <ReasonSelect />
        <input className="field min-h-9" name="comment" placeholder="Комментарий" />
        <Button type="submit" size="icon" variant="secondary" disabled={isSubmitting} title="Перенести">
          {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <Repeat2 aria-hidden="true" size={15} />}
        </Button>
      </div>
    </form>
  );
}

function CancelLessonForm({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    await submitJson(`/api/lessons/${lessonId}/cancel`, {
      reason: formData.get("reason"),
      comment: nullable(formData.get("comment"))
    }).catch(() => undefined);

    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="grid min-w-[220px] grid-cols-[1fr_1fr_40px] gap-2" onSubmit={onSubmit}>
      <ReasonSelect />
      <input className="field min-h-9" name="comment" placeholder="Комментарий" />
      <Button type="submit" size="icon" variant="danger" disabled={isSubmitting} title="Отменить">
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <Ban aria-hidden="true" size={15} />}
      </Button>
    </form>
  );
}

function SubstituteLessonForm({ lessonId, coaches }: { lessonId: string; coaches: Coach[] }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    await submitJson(`/api/lessons/${lessonId}/substitute`, {
      substituteCoachId: formData.get("substituteCoachId")
    }).catch(() => undefined);

    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="flex min-w-[190px] items-center gap-2" onSubmit={onSubmit}>
      <select className="field min-h-9" name="substituteCoachId" required>
        <option value="">Выбрать</option>
        {coaches.map((coach) => (
          <option key={coach.id} value={coach.id}>
            {coach.displayName}
          </option>
        ))}
      </select>
      <Button type="submit" size="icon" variant="secondary" disabled={isSubmitting} title="Назначить замену">
        {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : <UserCheck aria-hidden="true" size={15} />}
      </Button>
    </form>
  );
}

function ReasonSelect() {
  return (
    <select className="field min-h-9" name="reason" required>
      <option value="">Причина</option>
      {reasons.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
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
