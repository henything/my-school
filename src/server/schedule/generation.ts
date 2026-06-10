export type TemplateForGeneration = {
  id: string;
  groupId: string;
  branchId: string;
  coachId: string;
  weekday: number;
  startTime: string;
  endTime: string;
};

export type LessonCandidate = {
  scheduleTemplateId: string;
  groupId: string;
  branchId: string;
  coachId: string;
  lessonDate: Date;
  startTime: string;
  endTime: string;
};

export function parseMonthKey(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);

  if (!match) {
    throw new Error("Месяц должен быть в формате YYYY-MM.");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Месяц должен быть от 01 до 12.");
  }

  return {
    year,
    monthIndex: monthNumber - 1
  };
}

export function dateToKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateToWeekday(date: Date) {
  const utcDay = date.getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function datesForWeekdayInMonth(month: string, weekday: number) {
  const { year, monthIndex } = parseMonthKey(month);
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(year, monthIndex, 1));

  while (cursor.getUTCMonth() === monthIndex) {
    if (dateToWeekday(cursor) === weekday) {
      dates.push(new Date(cursor));
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function buildLessonCandidates(templates: TemplateForGeneration[], month: string): LessonCandidate[] {
  return templates.flatMap((template) =>
    datesForWeekdayInMonth(month, template.weekday).map((lessonDate) => ({
      scheduleTemplateId: template.id,
      groupId: template.groupId,
      branchId: template.branchId,
      coachId: template.coachId,
      lessonDate,
      startTime: template.startTime,
      endTime: template.endTime
    }))
  );
}
