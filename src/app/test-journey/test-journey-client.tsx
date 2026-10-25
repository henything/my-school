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
  signingMethod: string | null;
  contractStatus: string | null;
  consentStatus: string | null;
  childStatus: string | null;
  attendanceWeekday: number | null;
  scheduleChosen: boolean;
  weekdays: number[];
  reserveExpiresAt: string | null;
  paymentDueAt: string | null;
  firstPaidLessonDate: string | null;
  invoice: { id: string; number: string; amountKopeks: number; paidAmountKopeks: number; status: string; dueDate: string; paidDates: string[] } | null;
};

const weekdayLabels = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const stageLabels = ["Регистрация", "Данные семьи", "Пробное занятие", "Готово"];

function documentLabel(status: string | null) {
  if (status === "SIGNED") return "Подпись получена";
  if (status === "CANCELED" || status === "ANNULED") return "Подписание отклонено";
  if (status === "SIGNING_EXPIRED" || status === "DELETED") return "Срок подписания истёк";
  return "Ожидает подписи";
}

function invoiceLabel(status: string) {
  if (status === "PAID") return "Оплачен";
  if (status === "PARTIALLY_PAID") return "Оплачен частично";
  if (status === "OVERDUE") return "Просрочен";
  return "Ожидает оплаты";
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });
}

export function TestJourneyClient({ groups, token, parent, staffSession, mode = "TEST" }: { groups: Group[]; token: string; parent: Parent | null; staffSession: boolean; mode?: "TEST" | "PRODUCTION" }) {
  const router = useRouter();
  const apiBase = mode === "TEST" ? "/api/test-journey" : "/api/join";
  const pageBase = mode === "TEST" ? "/test-journey" : "/join";
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
  const continuing = journey?.trialStatus === "WANTS_TO_CONTINUE" || journey?.trialStatus === "CONVERTED_TO_ACTIVE";
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedLesson = selectedGroup?.lessons.find((lesson) => lesson.id === selectedLessonId);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${apiBase}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Не удалось загрузить заявку.");
        if (active) { setJourney(body as Journey); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Ошибка загрузки.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token, apiBase]);

  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== passwordConfirm) { setError("Пароли не совпадают."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiBase}/signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(mode === "TEST" ? { accessCode } : {}), parentPhone: phone, password, passwordConfirm })
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
      const response = await fetch(`${apiBase}/register`, {
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
      const response = await fetch(apiBase, {
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
      <h1 className="text-2xl font-bold">{token ? "Ваш путь после пробного занятия" : "Запись на пробное занятие"}</h1>
      {mode === "TEST" ? <p className="mt-2 text-sm text-[var(--muted)]">Тестовый стенд: используйте вымышленные данные ребёнка и паспорта. Деньги при тестовой оплате не списываются.</p> : <p className="mt-2 text-sm text-[var(--muted)]">Запишитесь на бесплатное пробное занятие. После него тренер расскажет, как прошло занятие, и поможет с дальнейшими шагами.</p>}
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
          {mode === "TEST" ? <label className="label">Код доступа к тесту<input className="field" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required autoComplete="off" /></label> : null}
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
            <p className="mt-1 text-sm text-[var(--muted)]">Здесь показаны ближайшие свободные занятия.</p></div>
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
            <div className="mt-6"><Button type="button" autoFocus onClick={() => router.push(`${pageBase}?token=${encodeURIComponent(createdToken)}`)}>Перейти в кабинет</Button></div>
          </div>
        </div> : null}
      </> : (
        <section className="mt-6 grid gap-4">
          {journey ? <>
            <div className="panel p-6">
              <p className="text-sm font-semibold text-[var(--accent-strong)]">Пробное занятие · {dateLabel(journey.trialDate)}</p>
              <h2 className="mt-2 text-2xl font-bold">
                {journey.invoice?.status === "PAID" ? "Всё готово — ждём ребёнка на занятиях!" :
                  continuing ? "Рады, что вы продолжаете занятия с нами!" :
                  journey.trialStatus === "NOT_PLANNING" ? "Спасибо, что попробовали занятия" :
                  journey.trialAttended === true ? "Спасибо, что пришли на пробное!" :
                  journey.trialAttended === false ? "Жаль, что не получилось прийти" : "Ваша запись на пробное сохранена"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                {journey.invoice?.status === "PAID" ? "Оплата отмечена. Ребёнок появится в будущих табелях группы." :
                  continuing ? "Тренер подтвердил продолжение. Выберите удобный график, затем подпишите документы и оплатите занятия." :
                  journey.trialStatus === "NOT_PLANNING" ? "Мы сохранили вашу заявку. Если захотите вернуться, свяжитесь с администратором." :
                  journey.trialStatus === "CONTACT_COLLECTED" ? "Тренер связался с вами. Как только решение о продолжении будет отмечено, здесь появится следующий шаг." :
                  journey.trialAttended === true ? "Тренер скоро свяжется с вами и расскажет, как прошло занятие." :
                  journey.trialAttended === false ? "Если хотите выбрать другую дату, свяжитесь с администратором." :
                  "После занятия тренер отметит посещение, и здесь появится следующий шаг."}
              </p>
            </div>

            {continuing ? <>
              <div className="grid gap-3 sm:grid-cols-3" aria-label="Этапы оформления">
                {["Выбрать график", "Подписать документы", "Оплатить занятия"].map((label, index) => {
                  const complete = index === 0 ? journey.scheduleChosen : index === 1 ? journey.signingStatus === "SIGNED" : journey.invoice?.status === "PAID";
                  const current = index === 0 ? !journey.scheduleChosen : index === 1 ? journey.scheduleChosen && journey.signingStatus !== "SIGNED" : journey.signingStatus === "SIGNED" && journey.invoice?.status !== "PAID";
                  return <div key={label} className={`rounded-xl border p-4 ${current ? "border-[var(--accent)] bg-[var(--blue-soft)]" : "border-[var(--line)] bg-white"}`}>
                    <span className="text-xs font-bold text-[var(--muted)]">Шаг {index + 1} {complete ? "· готово" : current ? "· сейчас" : ""}</span>
                    <p className="mt-1 font-semibold">{label}</p>
                  </div>;
                })}
              </div>

              {!journey.scheduleChosen ? <div className="panel grid gap-4 p-6">
                <div><h3 className="text-lg font-bold">Как ребёнок будет заниматься?</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">Выберите график. Затем мы предложим отправить SMS со ссылкой на договор и согласие.</p></div>
                <label className="label">Планируемый график<select className="field" value={chosenWeekday} onChange={(event) => setChosenWeekday(Number(event.target.value))}>
                  <option value={0}>Все занятия группы</option>
                  {journey.weekdays.map((weekday) => <option key={weekday} value={weekday}>Раз в неделю: {weekdayLabels[weekday]}</option>)}
                </select></label>
                <div><Button type="button" disabled={busy} onClick={() => void action("choose-schedule")}>Продолжить к документам</Button></div>
              </div> : null}

              {journey.scheduleChosen && journey.signingStatus !== "SIGNED" ? <div className="panel p-6">
                <p className="text-sm font-semibold text-[var(--accent-strong)]">Документы для зачисления</p>
                <h3 className="mt-1 text-xl font-bold">{journey.signingStatus === "WAITING" || journey.signingStatus === "SENT" ? "Проверьте SMS от F.Doc" : journey.signingStatus === "ERROR" ? "Не удалось отправить документы" : journey.signingStatus === "DECLINED" || journey.signingStatus === "EXPIRED" ? "Подписание не завершено" : "Подпишите договор и согласие"}</h3>
                <p className="mt-3 text-sm leading-6">
                  {journey.signingStatus === "WAITING" || journey.signingStatus === "SENT" ?
                    "Мы отправили ссылку на документы в SMS. Перейдите по ней, проверьте данные и подпишите договор и согласие." :
                    journey.signingStatus === "ERROR" ? "Свяжитесь с администратором, чтобы мы проверили отправку ссылки." :
                    journey.signingStatus === "DECLINED" || journey.signingStatus === "EXPIRED" ? "Ссылка больше не действует. Свяжитесь с администратором, чтобы получить новую." :
                    "Нажмите кнопку ниже — вам придёт SMS со ссылкой на документы. В F.Doc нужно будет проверить данные, заполнить паспортные поля и подписать договор и согласие."}
                </p>
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6">
                  <strong>Зачем нужны данные?</strong> Они нужны для оформления договора на занятия. Паспортные данные вы вводите на странице F.Doc: в анкете Азбуки движения мы их не запрашиваем. Сотрудники школы не должны просить у вас пароль от кабинета.
                </div>
                {journey.signingStatus === "WAITING" || journey.signingStatus === "SENT" ? <div className="mt-4 grid gap-2 rounded-xl border border-[var(--line)] p-4 text-sm">
                  <p>Договор · {documentLabel(journey.contractStatus)}</p><p>Согласие · {documentLabel(journey.consentStatus)}</p>
                </div> : null}
                {!journey.signingStatus || journey.signingStatus === "PENDING" ? <div className="mt-5"><Button type="button" disabled={busy} onClick={() => void action("start-signing")}>Получить SMS для подписания</Button></div> : null}
                {(journey.signingStatus === "WAITING" || journey.signingStatus === "SENT") ? <div className="mt-5"><Button variant="secondary" type="button" disabled={busy} onClick={() => void action("refresh")}>Я подписал(а) документы — проверить</Button></div> : null}
              </div> : null}

              {journey.signingStatus === "SIGNED" ? <div className="panel grid gap-3 p-6">
                <h3 className="text-xl font-bold">Документы подписаны</h3>
                <p className="text-sm text-[var(--muted)]">Договор и согласие {journey.signingMethod === "MANUAL" ? "проверены администратором" : "подписаны через F.Doc"}. Теперь можно оплатить занятия.</p>
                <div className="flex gap-4 text-sm font-semibold text-[var(--accent-strong)]">
                  <a className="underline" href={`/api/trials/${journey.trialId}/signing/contract`}>Скачать договор</a>
                  <a className="underline" href={`/api/trials/${journey.trialId}/signing/consent`}>Скачать согласие</a>
                </div>
                {journey.invoice ? <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <p className="font-semibold">Счёт {journey.invoice.number}</p>
                  <p className="mt-1 text-2xl font-bold">{(journey.invoice.amountKopeks / 100).toLocaleString("ru-RU")} ₽</p>
                  <p className="mt-1 text-sm">{invoiceLabel(journey.invoice.status)}</p>
                  {journey.invoice.paidDates.length ? <p className="mt-2 text-sm">Занятия в счёте: {journey.invoice.paidDates.map((date) => dateLabel(date)).join(" · ")}</p> : null}
                </div> : <div className="grid gap-3"><p className="text-sm">Счёт формируется. Обычно это занимает несколько секунд.</p>
                  <div><Button variant="secondary" type="button" disabled={busy} onClick={() => void action("refresh")}>Проверить счёт</Button></div>
                </div>}
                {journey.invoice && journey.invoice.status !== "PAID" && mode === "TEST" ? <div><Button type="button" disabled={busy} onClick={() => void action("simulate-payment")}>Симулировать оплату без списания денег</Button></div> : null}
                {journey.invoice && journey.invoice.status !== "PAID" && mode === "TEST" ? <p className="text-sm text-[var(--muted)]">На тестовом стенде кнопка отмечает счёт оплаченным без списания денег.</p> : null}
                {journey.invoice && journey.invoice.status !== "PAID" && mode === "PRODUCTION" ? <a className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-white" href={`/parent/payments?invoice=${journey.invoice.id}`}>Перейти к оплате</a> : null}
              </div> : null}

              <div className="panel grid gap-2 p-5 text-sm">
                <p><strong>График:</strong> {journey.scheduleChosen ? journey.attendanceWeekday === null ? "все занятия группы" : `раз в неделю, ${weekdayLabels[journey.attendanceWeekday]}` : "ещё не выбран"}</p>
                {journey.reserveExpiresAt ? <p><strong>Место зарезервировано до:</strong> {new Date(journey.reserveExpiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
                {journey.paymentDueAt ? <p><strong>Оплатить до:</strong> {new Date(journey.paymentDueAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК</p> : null}
                {journey.firstPaidLessonDate ? <p><strong>Первое платное занятие:</strong> {dateLabel(journey.firstPaidLessonDate)}</p> : null}
              </div>
            </> : null}
            <a className="text-sm font-semibold text-[var(--accent-strong)] underline" href="/parent">Открыть кабинет родителя</a>
          </> : <div className="panel p-6">Загружаю вашу заявку…</div>}
        </section>
      )}
      {error ? <p className="mt-4 text-red-700" role="alert">{error}</p> : null}
    </main>
  );
}
