export type Slot = { weekday: number; startTime: string; endTime: string };
export function lessonKey(lesson: { lessonDate: Date; startTime: string }) {
  return `${lesson.lessonDate.toISOString().slice(0, 10)}:${lesson.startTime}`;
}
export function scheduleHorizon(effective: Date, dates: Date[]) {
  const year = effective.getUTCFullYear() + (effective.getUTCMonth() >= 5 ? 1 : 0);
  return new Date(Math.max(Date.UTC(year, 4, 31), ...dates.map(d => d.getTime())));
}
export function incompatiblePlans(children: Array<{ id: string; fullName: string; attendancePlans: Array<{ effectiveFrom: Date; weekday: number | null }> }>, start: Date, slots: Slot[]) {
  const days = new Set(slots.map(slot => slot.weekday));
  return children.flatMap(child => {
    const plans = [...child.attendancePlans].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    const active = plans.filter(plan => plan.effectiveFrom <= start).at(-1);
    const affected = [...(active ? [{ ...active, effectiveFrom: start }] : []), ...plans.filter(plan => plan.effectiveFrom > start)];
    return affected.filter(plan => plan.weekday !== null && !days.has(plan.weekday)).map(plan => ({
      childId: child.id, childName: child.fullName, effectiveFrom: plan.effectiveFrom.toISOString().slice(0, 10), previousWeekday: plan.weekday!
    }));
  });
}
