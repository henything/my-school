"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Lesson = { id: string; date: string; time: string; group: string; branch: string; weekdays: number[] };
type Journey = {
  trialId: string;
  trialDate: string;
  trialStatus: string;
  trialAttended: boolean | null;
  signingStatus: string | null;
  contractStatus: string | null;
  consentStatus: string | null;
  childStatus: string | null;
  attendanceWeekday: number | null;
  scheduleChosen: boolean;
  weekdays: number[];
  reserveExpiresAt: string | null;
  paymentDueAt: string | null;
  firstPaidLessonDate: string | null;
  invoice: { number: string; amountKopeks: number; paidAmountKopeks: number; status: string; dueDate: string } | null;
};

export function TestJourneyClient({ lessons, token, existingParent, staffSession }: { lessons: Lesson[]; token: string; existingParent: boolean; staffSession: boolean }) {
  const router = useRouter();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [chosenWeekday, setChosenWeekday] = useState(0);
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

  async function action(name: "refresh" | "choose-schedule" | "start-signing" | "simulate-payment") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/test-journey", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: name, attendanceWeekday: chosenWeekday })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось обновить тест.");
      if (name === "simulate-payment") {
        setJourney(body.journey as Journey);
      } else setJourney(body as Journey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка обновления."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Тест полного пути F.Doc</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Изолированный контур. Создайте тестовый родительский кабинет. Используйте вымышленные данные ребёнка и паспорта. Через F.Doc DEMO придут договор и согласие на основе присланных вами документов. Тестовая оплата не списывает деньги.</p>
      {!token ? (
        <form className="panel mt-6 grid gap-4 p-5" onSubmit={register}>
          {staffSession ? <p className="text-sm text-[var(--muted)]">Вы вошли как сотрудник. После записи это окно переключится в новый родительский кабинет. Кабинет тренера откройте в приватном окне.</p> : null}
          <label className="label">Код доступа к тесту<input className="field" name="accessCode" required autoComplete="off" /></label>
          <label className="label">Пробное занятие<select className="field" name="lessonId" required value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
            <option value="">Выберите занятие</option>
            {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.date} {lesson.time} · {lesson.group} · {lesson.branch}</option>)}
          </select></label>
          <label className="label">Имя и фамилия родителя<input className="field" name="parentName" required /></label>
          <label className="label">Телефон для ссылки F.Doc<input className="field" name="parentPhone" type="tel" required placeholder="+7 999 123-45-67" /></label>
          <label className="label">Имя и фамилия ребёнка<input className="field" name="childName" required /></label>
          <label className="label">Дата рождения ребёнка<input className="field" name="childBirthDate" type="date" required /></label>
          {!existingParent ? <label className="label">Пароль для родительского кабинета<input className="field" name="password" type="password" minLength={10} autoComplete="new-password" required /></label> : null}
          <Button type="submit" disabled={busy || lessons.length === 0}>Записаться на пробное</Button>
        </form>
      ) : (
        <section className="panel mt-6 grid gap-3 p-5">
          <h2 className="font-semibold">Состояние заявки</h2>
          {journey ? <>
            <p>Пробное {journey.trialDate}: {journey.trialAttended === true ? "ребёнок был" : journey.trialAttended === false ? "ребёнок не пришёл" : "ожидает отметки"}</p>
            <p>Решение тренера: {journey.trialStatus === "WANTS_TO_CONTINUE" ? "будет ходить" : journey.trialStatus === "NOT_PLANNING" ? "пока не планирует" : journey.trialStatus === "CONTACT_COLLECTED" ? "ожидаем решения семьи" : "пока не принято"}</p>
            {journey.trialStatus === "WANTS_TO_CONTINUE" && !journey.scheduleChosen ? <div className="grid gap-2">
              <label className="label">Планируемый график<select className="field" value={chosenWeekday} onChange={(event) => setChosenWeekday(Number(event.target.value))}>
                <option value={0}>Все занятия группы</option>
                {journey.weekdays.map((weekday) => <option key={weekday} value={weekday}>Раз в неделю: {weekdayLabels[weekday]}</option>)}
              </select></label>
              <Button type="button" disabled={busy} onClick={() => void action("choose-schedule")}>Сохранить график</Button>
            </div> : null}
            {journey.trialStatus === "WANTS_TO_CONTINUE" && journey.scheduleChosen && !journey.signingStatus ?
              <Button type="button" disabled={busy} onClick={() => void action("start-signing")}>Подписать документы через F.Doc</Button> : null}
            {journey.trialStatus === "WANTS_TO_CONTINUE" && journey.scheduleChosen && !journey.signingStatus ? <p className="text-sm text-[var(--muted)]">После нажатия придёт SMS от F.Doc. Откройте два документа, проверьте подставленные данные, заполните паспорт в F.Doc и подпишите оба документа.</p> : null}
            <p>Документы: {journey.signingStatus ?? "ещё не отправлены"}</p>
            <p>Договор: {journey.contractStatus ?? "нет статуса"} · Согласие: {journey.consentStatus ?? "нет статуса"}</p>
            <p>График: {journey.attendanceWeekday === null ? "все занятия группы" : `раз в неделю, ${weekdayLabels[journey.attendanceWeekday]}`}</p>
            {journey.reserveExpiresAt ? <p>Резерв места до: {new Date(journey.reserveExpiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
            {journey.paymentDueAt ? <p>Оплатить до: {new Date(journey.paymentDueAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
            {journey.firstPaidLessonDate ? <p>Первое платное занятие: {journey.firstPaidLessonDate}</p> : null}
            <p>Ребёнок в системе: {journey.childStatus ?? "карточка готовится"}</p>
            {journey.invoice ? <p>Счёт {journey.invoice.number}: {(journey.invoice.amountKopeks / 100).toLocaleString("ru-RU")} ₽ · {journey.invoice.status}</p> : null}
            <Button variant="secondary" type="button" disabled={busy} onClick={() => void action("refresh")}>Проверить подпись и обновить путь</Button>
            {journey.signingStatus === "SIGNED" && journey.invoice && journey.invoice.status !== "PAID" ?
              <Button type="button" disabled={busy} onClick={() => void action("simulate-payment")}>Симулировать оплату без списания денег</Button> : null}
            {journey.signingStatus === "SIGNED" && journey.invoice && journey.invoice.status !== "PAID" ? <p className="text-sm text-[var(--muted)]">Счёт также виден в разделе «Оплаты» кабинета родителя. Кнопка выше отмечает его оплаченным только в тестовой базе.</p> : null}
            <a className="underline" href="/parent">Открыть родительский кабинет</a>
            {journey.invoice?.status === "PAID" ? <p>Оплата отмечена. Ребёнок должен появиться в будущих табелях группы.</p> : null}
          </> : <p>Загружаю состояние…</p>}
        </section>
      )}
      {error ? <p className="mt-4 text-red-700" role="alert">{error}</p> : null}
    </main>
  );
}
