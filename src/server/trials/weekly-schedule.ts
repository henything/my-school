const weekdayNames = new Map([
  [1, "понедельникам"],
  [2, "вторникам"],
  [3, "средам"],
  [4, "четвергам"],
  [5, "пятницам"],
  [6, "субботам"],
  [7, "воскресеньям"]
]);

export function describeWeeklySchedule(groupWeekdays: number[], selectedWeekday: number | null) {
  const days = selectedWeekday === null ? [...new Set(groupWeekdays)].sort((a, b) => a - b) : [selectedWeekday];
  if (!days.length || days.some((day) => !weekdayNames.has(day))) {
    throw new Error("Для договора не найдено действующее расписание группы.");
  }
  if (selectedWeekday !== null && !groupWeekdays.includes(selectedWeekday)) {
    throw new Error("Выбранного дня больше нет в расписании группы.");
  }
  const selectedLessons = groupWeekdays.filter((day) => days.includes(day));
  if (selectedLessons.length !== days.length) {
    throw new Error("В один из выбранных дней назначено несколько занятий. Уточните график для договора у администратора.");
  }
  const count = days.length;
  if (count > 2) throw new Error("Этот договор рассчитан на одно или два занятия в неделю. Уточните график у администратора.");
  const countWord = count % 10 === 1 && count % 100 !== 11 ? "занятие" :
    count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "занятия" : "занятий";
  const names = days.map((day) => weekdayNames.get(day)!);
  const dayText = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} и ${names.at(-1)}`;
  return `${count} ${countWord} в неделю, по ${dayText}`;
}
