"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Group = { id: string; name: string; branch: string; address: string; schedule: { weekday: number; startTime: string; endTime: string }[]; lessons: { id: string; date: string; time: string }[] };
type Parent = { fullName: string | null; phone: string | null; vkProfileUrl: string | null };
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

const weekdayLabels = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const stageLabels = ["Регистрация", "Данные семьи", "Пробное занятие", "Готово"];

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });
}

export function TestJourneyClient({ groups, token, parent, staffSession }: { groups: Group[]; token: string; parent: Parent | null; staffSession: boolean }) {
  const router = useRouter();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(parent ? 2 : 1);
  const [accessCode, setAccessCode] = useState("");
  const [phone, setPhone] = useState(parent?.phone ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [parentName, setParentName] = useState(parent?.fullName ?? "");
  const [parentVkUrl, setParentVkUrl] = useState(parent?.vkProfileUrl ?? "");
  const [childName, setChildName] = useState("");
  const [childBirthDate, setChildBirthDate] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [createdToken, setCreatedToken] = useState("");
  const [chosenWeekday, setChosenWeekday] = useState(0);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedLesson = selectedGroup?.lessons.find((lesson) => lesson.id === selectedLessonId);

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

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordConfirm) { setError("Пароли не совпадают."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/test-journey/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode, parentPhone: phone, password, passwordConfirm })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось создать кабинет.");
      setPhone(body.phone as string);
      setStage(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ошибка регистрации."); }
    finally { setBusy(false); }
  }

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStage(3);
  }

  async function register() {
    if (!selectedLessonId || !selectedGroup) { setError("Выберите группу и дату пробного занятия."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/test-journey/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: selectedLessonId, parentName, parentVkUrl, childName, childBirthDate })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Не удалось записаться.");
      setCreatedToken(body.token as string);
      setStage(4);
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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Запись на пробное занятие</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Тестовый контур: используйте вымышленные данные ребёнка и паспорта. Документы придут через F.Doc DEMO, деньги при тестовой оплате не списываются.</p>
      {!token ? <>
        <nav className="mt-7 grid grid-cols-4 gap-2" aria-label="Шаги записи">
          {stageLabels.map((label, index) => <div key={label} aria-current={stage === index + 1 ? "step" : undefined}
            className={`rounded-lg px-2 py-3 text-center text-xs font-semibold sm:text-sm ${stage >= index + 1 ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--muted)]"}`}>
            <span className="block">{index + 1}</span>{label}
          </div>)}
        </nav>
        {stage === 1 ? <form className="panel mt-6 grid gap-4 p-5" onSubmit={signup}>
          <h2 className="text-lg font-bold">Создайте кабинет родителя</h2>
          {staffSession ? <p className="text-sm text-[var(--muted)]">Сейчас вы вошли как сотрудник. После регистрации это окно переключится в кабинет родителя. Кабинет тренера откройте в приватном окне.</p> : null}
          <label className="label">Код доступа к тесту<input className="field" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required autoComplete="off" /></label>
          <label className="label">Номер телефона<input className="field" value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" required placeholder="+7 999 123-45-67" autoComplete="tel" /></label>
          <label className="label">Придумайте пароль<input className="field" value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={10} maxLength={128} required autoComplete="new-password" /></label>
          <label className="label">Повторите пароль<input className="field" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} type="password" minLength={10} maxLength={128} required autoComplete="new-password" aria-invalid={Boolean(passwordConfirm && password !== passwordConfirm)} /></label>
          {passwordConfirm && password !== passwordConfirm ? <p className="text-sm text-red-700">Пароли не совпадают.</p> : null}
          <Button type="submit" disabled={busy || Boolean(passwordConfirm && password !== passwordConfirm)}>Продолжить</Button>
          <p className="text-sm text-[var(--muted)]">Уже есть кабинет? <a className="underline" href="/login">Войти</a></p>
        </form> : null}
        {stage === 2 ? <form className="panel mt-6 grid gap-4 p-5" onSubmit={saveDetails}>
          <h2 className="text-lg font-bold">Расскажите о себе и ребёнке</h2>
          <p className="text-sm text-[var(--muted)]">Телефон для связи и документов: {phone}</p>
          <label className="label">Имя и фамилия родителя<input className="field" value={parentName} onChange={(event) => setParentName(event.target.value)} required autoComplete="name" /></label>
          <label className="label">Ссылка на страницу ВК (необязательно)<input className="field" value={parentVkUrl} onChange={(event) => setParentVkUrl(event.target.value)} type="url" placeholder="https://vk.ru/id..." /></label>
          <label className="label">Имя и фамилия ребёнка<input className="field" value={childName} onChange={(event) => setChildName(event.target.value)} required /></label>
          <label className="label">Дата рождения ребёнка<input className="field" value={childBirthDate} onChange={(event) => setChildBirthDate(event.target.value)} type="date" required /></label>
          <Button type="submit">Выбрать группу</Button>
        </form> : null}
        {stage === 3 ? <section className="mt-6 grid gap-4">
          <div className="panel p-5"><h2 className="text-lg font-bold">Выберите группу и пробное занятие</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Здесь показаны группы Азбуки движения и ближайшие свободные занятия на тестовом стенде.</p></div>
          {groups.map((group) => <div key={group.id} className={`panel p-5 ${selectedGroupId === group.id ? "ring-2 ring-[var(--accent)]" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-bold">{group.branch} · {group.name}</h3><p className="mt-1 text-sm">{group.address}</p></div>
              <Button type="button" variant={selectedGroupId === group.id ? "secondary" : "primary"} disabled={group.lessons.length === 0}
                onClick={() => { setSelectedGroupId(group.id); setSelectedLessonId(""); setError(""); }}>
                {selectedGroupId === group.id ? "Группа выбрана" : "Выбрать группу"}
              </Button>
            </div>
            <p className="mt-3 text-sm"><strong>Расписание:</strong> {group.schedule.length ? group.schedule.map((item) => `${weekdayLabels[item.weekday]} ${item.startTime}–${item.endTime}`).join(" · ") : "уточняется"}</p>
            {group.lessons.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Пока нет свободных дат для пробного.</p> : null}
            {selectedGroupId === group.id ? <fieldset className="mt-4"><legend className="font-semibold">Когда прийти на пробное?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{group.lessons.map((lesson) => <label key={lesson.id} className={`cursor-pointer rounded-lg border p-3 text-sm ${selectedLessonId === lesson.id ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--line)]"}`}>
                <input type="radio" name="trialLesson" value={lesson.id} checked={selectedLessonId === lesson.id} onChange={() => setSelectedLessonId(lesson.id)} className="mr-2" />
                {dateLabel(lesson.date)}, {lesson.time}
              </label>)}</div>
            </fieldset> : null}
          </div>)}
          {groups.length === 0 ? <div className="panel p-5">Пока нет доступных групп. Обратитесь к администратору.</div> : null}
          <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => setStage(2)}>Назад к данным</Button>
            <Button type="button" disabled={busy || !selectedLessonId} onClick={() => void register()}>Записать на пробное занятие</Button></div>
        </section> : null}
        {stage === 4 && selectedGroup && selectedLesson ? <div role="dialog" aria-modal="true" aria-labelledby="signup-success-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-7 text-center shadow-xl">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700" aria-hidden="true">✓</div>
            <h2 id="signup-success-title" className="text-2xl font-bold">Спасибо, ждём вас на пробном!</h2>
            <p className="mt-3">{childName}: группа {selectedGroup.name}.</p>
            <p className="mt-2 font-semibold">{dateLabel(selectedLesson.date)} в {selectedLesson.time}</p>
            <p className="mt-1 text-sm">{selectedGroup.address}</p>
            <p className="mt-4 text-sm text-[var(--muted)]">Тренер отметит посещение после занятия. Дальнейшие шаги появятся в вашем кабинете.</p>
            <div className="mt-6"><Button type="button" autoFocus onClick={() => router.push(`/test-journey?token=${encodeURIComponent(createdToken)}`)}>Перейти в кабинет</Button></div>
          </div>
        </div> : null}
      </> : (
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
