"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ScheduleChangePreview } from "@/server/schedule/change-service";

type Group = { id: string; name: string; status: string; branch: { name: string } };
type Slot = { weekday: number; startTime: string; endTime: string };
type Plan = { childId: string; effectiveFrom: string; weekday: number | null };
type Choice = ScheduleChangePreview["planChoices"][number];
const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const money = (value: number | null) => value === null ? "Счёта не было" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value / 100);
const date = (value: string) => value.split("-").reverse().join(".");
const key = (value: { childId: string; effectiveFrom: string }) => `${value.childId}:${value.effectiveFrom}`;

export function ScheduleChangePanel({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [slots, setSlots] = useState<Slot[]>([{ weekday: 2, startTime: "10:00", endTime: "11:00" }, { weekday: 4, startTime: "10:00", endTime: "11:00" }]);
  const [reason, setReason] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [preview, setPreview] = useState<ScheduleChangePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function invalidate(resetPlans = false) {
    setPreview(null); setAcknowledged(false); setError(""); setMessage("");
    if (resetPlans) { setPlans([]); setChoices([]); }
  }
  function updateSlot(index: number, patch: Partial<Slot>) {
    invalidate(true);
    setSlots(current => current.map((slot, i) => i === index ? { ...slot, ...patch } : slot));
  }
  async function submit(action: "preview" | "apply") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/groups/${groupId}/schedule-change`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, effectiveFrom, slots, plans, reason, action,
          ...(action === "apply" ? { fingerprint: preview?.fingerprint, acknowledgeManualTasks: acknowledged } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось изменить расписание.");
      const result = payload.result as ScheduleChangePreview;
      setChoices(result.planChoices);
      setAcknowledged(false);
      if (action === "apply") {
        setPreview(null); setChoices([]); setPlans([]);
        setMessage(`Расписание группы «${result.groupName}» изменено. Отменено занятий: ${result.cancelled.length}, создано: ${result.created.length}. Счетов обработано: ${result.bills.length}.${result.manualTaskCount ? ` Создано задач администратору: ${result.manualTaskCount}.` : ""}`);
        router.refresh();
      } else setPreview(result);
    } catch (failure) {
      setPreview(null); setAcknowledged(false);
      setError(failure instanceof Error ? failure.message : "Не удалось получить расчёт.");
    } finally { setBusy(false); }
  }
  function onPreview(event: FormEvent) { event.preventDefault(); void submit("preview"); }
  const availableDays = [...new Set(slots.map(slot => slot.weekday))].sort((a, b) => a - b);
  const canApply = preview && !preview.applied && preview.blockers.length === 0 && (!preview.manualTaskCount || acknowledged);

  return <section className="panel min-w-0 p-5" aria-labelledby="schedule-change-heading">
    <h2 id="schedule-change-heading" className="text-lg font-bold">Изменить расписание с даты</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">Заменяет расписание группы с выбранной даты и пересчитывает счета. Отметки посещаемости и реальные платежи сохраняются. Сначала проверьте предварительный расчёт.</p>
    <form onSubmit={onPreview} className="mt-4 grid gap-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-4 disabled:opacity-60">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="label">Группа для изменения расписания
            <select className="field" required value={groupId} onChange={event => { invalidate(true); setGroupId(event.target.value); }}>
              <option value="">Выберите группу</option>
              {groups.filter(group => group.status !== "ARCHIVED").map(group => <option key={group.id} value={group.id}>{group.branch.name} · {group.name}</option>)}
            </select>
          </label>
          <label className="label">Новое расписание действует с
            <input className="field" type="date" required value={effectiveFrom} onChange={event => { invalidate(true); setEffectiveFrom(event.target.value); }} />
          </label>
        </div>
        <div className="grid gap-3">
          <h3 className="font-semibold">Новые дни и время занятий</h3>
          {slots.map((slot, index) => <div className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" key={index}>
            <label className="label">День недели {index + 1}<select className="field" value={slot.weekday} onChange={event => updateSlot(index, { weekday: Number(event.target.value) })}>
              {weekdays.map((day, dayIndex) => <option value={dayIndex + 1} key={day}>{day}</option>)}
            </select></label>
            <label className="label">Начало {index + 1}<input className="field" type="time" required value={slot.startTime} onChange={event => updateSlot(index, { startTime: event.target.value })} /></label>
            <label className="label">Окончание {index + 1}<input className="field" type="time" required value={slot.endTime} onChange={event => updateSlot(index, { endTime: event.target.value })} /></label>
            <Button type="button" variant="secondary" disabled={slots.length === 1} aria-label={`Убрать день ${index + 1}`} onClick={() => { invalidate(true); setSlots(slots.filter((_, i) => i !== index)); }}>Убрать</Button>
          </div>)}
          <Button type="button" variant="secondary" className="justify-self-start" disabled={slots.length >= 14} onClick={() => { invalidate(true); setSlots([...slots, { weekday: 1, startTime: "10:00", endTime: "11:00" }]); }}>Добавить день</Button>
        </div>
        <label className="label">Причина изменения<textarea className="field min-h-20" required value={reason} onChange={event => { invalidate(); setReason(event.target.value); }} /></label>
        {choices.length > 0 ? <div className="grid gap-3 rounded-lg border border-[var(--warning)] p-4">
          <h3 className="font-bold">Выберите новые графики детей</h3>
          <p className="text-sm">Прежний день исчезает из расписания. Выберите замену для каждого периода, затем получите новый расчёт.</p>
          {choices.map(choice => {
            const plan = plans.find(item => key(item) === key(choice));
            return <label className="label" key={key(choice)}>{choice.childName} · с {date(choice.effectiveFrom)} · ранее: {weekdays[choice.previousWeekday - 1]}
              <select className="field" aria-label={`Новый график ${choice.childName} с ${date(choice.effectiveFrom)}`} value={plan ? plan.weekday === null ? "all" : String(plan.weekday) : ""} onChange={event => {
                invalidate();
                setPlans(current => [...current.filter(item => key(item) !== key(choice)), ...(event.target.value ? [{ childId: choice.childId, effectiveFrom: choice.effectiveFrom, weekday: event.target.value === "all" ? null : Number(event.target.value) }] : [])]);
              }}><option value="">Выберите новый график</option><option value="all">Все занятия группы</option>{availableDays.map(day => <option key={day} value={day}>{weekdays[day - 1]}</option>)}</select>
            </label>;
          })}
        </div> : null}
        <Button type="submit" className="justify-self-start" disabled={!groupId || !reason.trim()}>{busy ? "Выполняется расчёт…" : "Предварительный расчёт"}</Button>
      </fieldset>
    </form>
    {error ? <p className="mt-4 rounded-lg border border-[var(--danger)] p-3 text-sm" role="alert">{error}</p> : null}
    {message ? <p className="mt-4 text-sm font-semibold" role="status">{message}</p> : null}
    {preview ? <div className="mt-5 grid min-w-0 gap-4 border-t border-[var(--line)] pt-5">
      <h3 className="font-bold">Результат для группы «{preview.groupName}»</h3>
      <p className="text-sm">С {date(preview.effectiveFrom)} по {date(preview.through)}. Будущие занятия по этим дням будут создаваться по новому расписанию.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <LessonDates title="Будут отменены" lessons={preview.cancelled} />
        <LessonDates title="Будут созданы" lessons={preview.created} />
        <LessonDates title="Сохраняются с табелями" lessons={preview.preserved} />
      </div>
      {preview.blockers.length > 0 ? <div className="rounded-lg border border-[var(--warning)] p-4" role="alert"><h4 className="font-semibold">Сначала устраните препятствия</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{preview.blockers.map((blocker, i) => <li key={i}>{blocker}</li>)}</ul></div> : <>
        <div className="min-w-0"><h4 className="mb-2 font-semibold">Изменения счетов: {preview.bills.length}</h4>
          {preview.bills.length > 0 ? <div className="max-h-96 overflow-auto rounded-lg border border-[var(--line)]" tabIndex={0} aria-label="Предварительные суммы счетов"><table className="data-table min-w-[850px]"><thead><tr><th>Ребёнок / месяц</th><th>Занятия</th><th>До</th><th>После</th><th>Новый зачёт</th><th>Действие</th></tr></thead><tbody>{preview.bills.map((bill, i) => <tr key={i}>
            <td>{bill.childName}<div className="text-sm text-[var(--muted)]">{bill.month.split("-").reverse().join(".")}</div></td>
            <td>{bill.beforeLessons ?? "—"} → {bill.afterLessons ?? "—"}</td><td>{money(bill.beforeKopeks)}</td><td>{money(bill.afterKopeks)}</td><td>{money(bill.creditKopeks)}</td><td>{bill.action}{bill.warning ? <p className="mt-1 max-w-sm text-sm">{bill.warning}</p> : null}</td>
          </tr>)}</tbody></table></div> : <p className="text-sm text-[var(--muted)]">Счета не требуют изменений.</p>}
        </div>
        <p className="text-sm text-[var(--muted)]">Для оплаченного счёта уменьшение оформляется зачётом на следующий месяц. Увеличение и начатые оплаты проверяет администратор без автоматического доначисления.</p>
        {preview.manualTasks.length > 0 ? <div className="rounded-lg border border-[var(--warning)] p-4 text-sm"><h4 className="font-semibold">Задачи администратору</h4><ul className="mt-2 list-disc space-y-1 pl-5">{preview.manualTasks.map((task, index) => <li key={index}>{task}</li>)}</ul></div> : null}
        {preview.manualTaskCount > 0 ? <label className="flex items-start gap-3 rounded-lg border border-[var(--warning)] p-4 text-sm"><input className="mt-1" type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>Подтверждаю сохранение с задачами администратору ({preview.manualTaskCount}). Счета с ограничениями требуют отдельной проверки; автоматического доначисления не будет.</span></label> : null}
      </>}
      <Button type="button" className="justify-self-start" disabled={busy || !canApply} onClick={() => void submit("apply")}>{busy ? "Сохранение…" : "Подтвердить и применить изменения"}</Button>
    </div> : null}
  </section>;
}

function LessonDates({ title, lessons }: { title: string; lessons: Array<{ date: string; time: string }> }) {
  return <details className="min-w-0 rounded-lg border border-[var(--line)] p-3"><summary className="cursor-pointer font-semibold">{title}: {lessons.length}</summary>{lessons.length > 0 ? <ul className="mt-2 max-h-48 overflow-auto text-sm">{[...lessons].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((lesson, i) => <li key={i}>{date(lesson.date)} · {lesson.time}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">Нет занятий</p>}</details>;
}
