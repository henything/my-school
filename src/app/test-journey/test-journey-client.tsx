"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Lesson = { id: string; date: string; time: string; group: string; branch: string; weekdays: number[] };
type Journey = {
  trialDate: string;
  trialStatus: string;
  trialAttended: boolean | null;
  signingStatus: string | null;
  contractStatus: string | null;
  consentStatus: string | null;
  childStatus: string | null;
  attendanceWeekday: number | null;
  reserveExpiresAt: string | null;
  paymentDueAt: string | null;
  firstPaidLessonDate: string | null;
  invoice: { number: string; amountKopeks: number; paidAmountKopeks: number; status: string; dueDate: string } | null;
};

export function TestJourneyClient({ lessons, token }: { lessons: Lesson[]; token: string }) {
  const router = useRouter();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  const weekdayLabels = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

  useEffect(() => {
    if (!token) return;
    fetch(`/api/test-journey?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить тест.");
        setJourney(body as Journey);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки."));
  }, [token]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/test-journey/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось записаться.");
      router.push(`/test-journey?token=${encodeURIComponent(body.token)}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка записи."); }
    finally { setBusy(false); }
  }

  async function action(name: "refresh" | "simulate-payment") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/test-journey", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: name })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось обновить тест.");
      if (name === "simulate-payment") {
        setJourney(body.journey as Journey);
        setActivationUrl(body.activationUrl ?? null);
      } else setJourney(body as Journey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка обновления."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Тест полного пути F.Doc</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Изолированный контур. Используйте вымышленные данные ребёнка и паспорта. Тестовая оплата не списывает деньги.</p>
      {!token ? (
        <form className="panel mt-6 grid gap-4 p-5" onSubmit={register}>
          <label className="label">Код доступа к тесту<input className="field" name="accessCode" required autoComplete="off" /></label>
          <label className="label">Пробное занятие<select className="field" name="lessonId" required value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
            <option value="">Выберите занятие</option>
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.date} {lesson.time} · {lesson.group} · {lesson.branch}</option>)}
          </select></label>
          <label className="label">График после пробного<select className="field" name="attendanceWeekday" defaultValue="0">
            <option value="0">Все занятия группы</option>
            {selectedLesson?.weekdays.map((weekday) => <option key={weekday} value={weekday}>Раз в неделю: {weekdayLabels[weekday]}</option>)}
          </select></label>
          <label className="label">ФИО родителя<input className="field" name="parentName" required /></label>
          <label className="label">Телефон для ссылки F.Doc<input className="field" name="parentPhone" type="tel" required placeholder="+7 999 123-45-67" /></label>
          <label className="label">Имя и фамилия ребёнка<input className="field" name="childName" required /></label>
          <label className="label">Дата рождения ребёнка<input className="field" name="childBirthDate" type="date" required /></label>
          <Button type="submit" disabled={busy || lessons.length === 0}>Записаться на пробное</Button>
        </form>
      ) : (
        <section className="panel mt-6 grid gap-3 p-5">
          <h2 className="font-semibold">Состояние заявки</h2>
          {journey ? <>
            <p>Пробное {journey.trialDate}: {journey.trialAttended === true ? "ребёнок был" : journey.trialAttended === false ? "ребёнок не пришёл" : "ожидает отметки"}</p>
            <p>Документы: {journey.signingStatus ?? "ещё не отправлены"}</p>
            <p>Договор: {journey.contractStatus ?? "нет статуса"} · Согласие: {journey.consentStatus ?? "нет статуса"}</p>
            <p>График: {journey.attendanceWeekday === null ? "все занятия группы" : `раз в неделю, ${weekdayLabels[journey.attendanceWeekday]}`}</p>
            {journey.reserveExpiresAt ? <p>Резерв места до: {new Date(journey.reserveExpiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
            {journey.paymentDueAt ? <p>Оплатить до: {new Date(journey.paymentDueAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
            {journey.firstPaidLessonDate ? <p>Первое платное занятие: {journey.firstPaidLessonDate}</p> : null}
            <p>Ребёнок в системе: {journey.childStatus ?? "после подписи"}</p>
            {journey.invoice ? <p>Счёт {journey.invoice.number}: {(journey.invoice.amountKopeks / 100).toLocaleString("ru-RU")} ₽ · {journey.invoice.status}</p> : null}
            <Button variant="secondary" type="button" disabled={busy} onClick={() => void action("refresh")}>Проверить подпись и обновить путь</Button>
            {journey.signingStatus === "SIGNED" && journey.invoice && journey.invoice.status !== "PAID" ?
              <Button type="button" disabled={busy} onClick={() => void action("simulate-payment")}>Симулировать оплату без списания денег</Button> : null}
            {activationUrl ? <a className="underline" href={activationUrl} referrerPolicy="no-referrer">Создать пароль родительского кабинета</a> : null}
            {journey.invoice?.status === "PAID" ? <p>Оплата отмечена. Ребёнок должен появиться в будущих табелях группы.</p> : null}
          </> : <p>Загружаю состояние…</p>}
        </section>
      )}
      {error ? <p className="mt-4 text-red-700" role="alert">{error}</p> : null}
    </main>
  );
}
