"use client";

import { CalendarClock, Search } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { StatusBadge } from "@/components/badges";
import { formatDate, formatLessonDateTime, formatTimeRange } from "@/lib/date-format";
import { labelForEnum, labelsForSearch } from "@/lib/labels";

type ScheduleTemplate = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  status: string;
  group: { id: string; name: string };
  branch: { name: string };
  coach: { displayName: string };
};

type Lesson = {
  id: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  status: string;
  changeReason: string | null;
  group: { id: string; name: string };
  branch: { name: string };
  coach: { displayName: string };
  substituteCoach: { displayName: string } | null;
};

type ScheduleTablesProps = {
  scheduleTemplates: ScheduleTemplate[];
  lessons: Lesson[];
  children?: ReactNode;
};

const weekdayLabels = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const weekdayNames = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

export function ScheduleTables({ scheduleTemplates, lessons, children }: ScheduleTablesProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [monthFilter, setMonthFilter] = useState("ALL");
  const normalizedQuery = normalize(query);
  const groups = useMemo(() => uniqueGroups(scheduleTemplates, lessons), [scheduleTemplates, lessons]);
  const months = useMemo(() => [...new Set(lessons.map((lesson) => lesson.lessonDate.slice(0, 7)))].sort().reverse(), [lessons]);
  const hasActiveFilters = Boolean(normalizedQuery) || statusFilter !== "ALL" || groupFilter !== "ALL" || monthFilter !== "ALL";

  const filteredTemplates = useMemo(
    () =>
      scheduleTemplates.filter((template) => {
        const matchesStatus = statusFilter === "ALL" || template.status === statusFilter;
        const matchesGroup = groupFilter === "ALL" || template.group.id === groupFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(`${template.group.name} ${template.branch.name} ${template.coach.displayName} ${weekdayLabels[template.weekday]} ${weekdayNames[template.weekday]} ${formatTimeRange(template.startTime, template.endTime)} ${labelsForSearch(template.status)}`).includes(
            normalizedQuery
          );

        return matchesStatus && matchesGroup && matchesQuery;
      }),
    [groupFilter, normalizedQuery, scheduleTemplates, statusFilter]
  );

  const filteredLessons = useMemo(
    () =>
      lessons.filter((lesson) => {
        const matchesStatus = statusFilter === "ALL" || lesson.status === statusFilter;
        const matchesGroup = groupFilter === "ALL" || lesson.group.id === groupFilter;
        const matchesMonth = monthFilter === "ALL" || lesson.lessonDate.startsWith(monthFilter);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalize(
            `${lesson.lessonDate} ${formatDate(lesson.lessonDate)} ${formatLessonDateTime(lesson.lessonDate, lesson.startTime, lesson.endTime)} ${lesson.group.name} ${lesson.branch.name} ${lesson.coach.displayName} ${lesson.substituteCoach?.displayName ?? ""} ${labelsForSearch(lesson.status, lesson.changeReason)}`
          ).includes(normalizedQuery);

        return matchesStatus && matchesGroup && matchesMonth && matchesQuery;
      }),
    [groupFilter, lessons, monthFilter, normalizedQuery, statusFilter]
  );

  const upcomingLessons = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const future = filteredLessons.filter((lesson) => lesson.lessonDate >= today && lesson.status !== "CANCELLED");
    return future.length > 0 ? future.slice(0, 6) : filteredLessons.slice(-6).reverse();
  }, [filteredLessons]);

  const needsAttention = filteredLessons.filter((lesson) => lesson.status === "SCHEDULED" || lesson.status === "ATTENDANCE_PENDING").length;

  return (
    <section className="grid gap-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CalendarClock className="text-[var(--accent)]" aria-hidden="true" size={18} />
              {hasActiveFilters ? "Занятия по фильтру" : "Ближайшая нагрузка"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Поиск и фильтры обновляют карточки, счётчики и таблицы ниже.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricChip label="Шаблоны" value={filteredTemplates.length} />
            <MetricChip label="Занятия" value={filteredLessons.length} />
            <MetricChip label="В работе" value={needsAttention} tone={needsAttention > 0 ? "warning" : "neutral"} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_minmax(180px,220px)_190px]">
          <label className="label">
            Поиск
            <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Дата, группа, филиал, тренер" />
          </label>
          <label className="label">
            Статус
            <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">Все статусы</option>
              <option value="ACTIVE">{labelForEnum("ACTIVE")} · шаблоны</option>
              <option value="SCHEDULED">{labelForEnum("SCHEDULED")} · занятия</option>
              <option value="ATTENDANCE_PENDING">{labelForEnum("ATTENDANCE_PENDING")} · занятия</option>
              <option value="ATTENDANCE_COMPLETED">{labelForEnum("ATTENDANCE_COMPLETED")} · занятия</option>
              <option value="CANCELLED">{labelForEnum("CANCELLED")} · занятия</option>
            </select>
          </label>
          <label className="label">
            Группа
            <select className="field" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="ALL">Все группы</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Месяц занятий
            <select className="field" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
              <option value="ALL">Все месяцы</option>
              {months.map((month) => (
                <option key={month} value={month}>{formatMonth(month)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--muted)]">Месяц относится к занятиям; шаблоны повторяются каждую неделю.</p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
              onClick={() => { setQuery(""); setStatusFilter("ALL"); setGroupFilter("ALL"); setMonthFilter("ALL"); }}
            >
              Сбросить фильтры
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {upcomingLessons.map((lesson) => (
            <div key={lesson.id} className="rounded-lg border border-[var(--line)] bg-[#fbfcfb] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{lesson.group.name}</span>
                <StatusBadge status={lesson.status} />
              </div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                {formatLessonDateTime(lesson.lessonDate, lesson.startTime, lesson.endTime)} · {lesson.coach.displayName}
              </div>
            </div>
          ))}
          {upcomingLessons.length === 0 ? <p className="text-sm font-semibold text-[var(--muted)]">Занятий по выбранным фильтрам нет.</p> : null}
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Search className="text-[var(--accent)]" aria-hidden="true" size={18} />
            Шаблоны расписания
          </h2>
          <span className="text-sm font-semibold text-[var(--muted)]">{filteredTemplates.length} из {scheduleTemplates.length}</span>
        </div>
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Группа</th>
                <th>День</th>
                <th>Время</th>
                <th>Тренер</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((template) => (
                <tr key={template.id}>
                  <td className="font-semibold">{template.group.name}</td>
                  <td>{weekdayLabels[template.weekday]}</td>
                  <td>
                    {formatTimeRange(template.startTime, template.endTime)}
                  </td>
                  <td>{template.coach.displayName}</td>
                  <td>
                    <StatusBadge status={template.status} />
                  </td>
                </tr>
              ))}
              {filteredTemplates.length === 0 ? <EmptyTableRow colSpan={5} label="Шаблоны по фильтрам не найдены." /> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-bold">Занятия</h2>
          <span className="text-sm font-semibold text-[var(--muted)]">{filteredLessons.length} из {lessons.length}</span>
        </div>
        <div className="table-shell">
          <table className="data-table min-w-[920px]">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Группа</th>
                <th>Филиал</th>
                <th>Тренер</th>
                <th>Статус</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {filteredLessons.map((lesson) => (
                <tr key={lesson.id}>
                  <td className="font-semibold">
                    {formatLessonDateTime(lesson.lessonDate, lesson.startTime, lesson.endTime)}
                  </td>
                  <td>{lesson.group.name}</td>
                  <td>{lesson.branch.name}</td>
                  <td>
                    <div>{lesson.coach.displayName}</div>
                    {lesson.substituteCoach ? <div className="text-xs text-[var(--muted)]">Замена: {lesson.substituteCoach.displayName}</div> : null}
                  </td>
                  <td>
                    <StatusBadge status={lesson.status} />
                  </td>
                  <td>{lesson.changeReason ? labelForEnum(lesson.changeReason) : "-"}</td>
                </tr>
              ))}
              {filteredLessons.length === 0 ? <EmptyTableRow colSpan={6} label="Занятия по фильтрам не найдены." /> : null}
            </tbody>
          </table>
        </div>
      </div>

      {children ? (
        <section className="grid gap-4" aria-label="Управление расписанием">
          <h2 className="text-lg font-bold">Управление расписанием</h2>
          {children}
        </section>
      ) : null}
    </section>
  );
}

function uniqueGroups(templates: ScheduleTemplate[], lessons: Lesson[]) {
  const groupById = new Map<string, { id: string; name: string }>();

  for (const template of templates) {
    groupById.set(template.group.id, template.group);
  }

  for (const lesson of lessons) {
    groupById.set(lesson.group.id, lesson.group);
  }

  return [...groupById.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function MetricChip({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" }) {
  return (
    <span className={tone === "warning" ? "badge bg-[var(--yellow-soft)] text-[var(--warning-strong)]" : "badge bg-[var(--blue-soft)] text-[var(--accent-strong)]"}>
      {label}: {value}
    </span>
  );
}

function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-sm font-semibold text-[var(--muted)]">
        {label}
      </td>
    </tr>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[./-]/g, "-").replace(/\s+/g, " ");
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));
}
