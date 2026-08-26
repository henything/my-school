import { Children, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  ListChecks,
  ShieldAlert,
  TicketCheck,
  UserMinus,
  WalletCards,
  Users
} from "lucide-react";
import { ManualTaskForm } from "@/app/admin/operations/components/manual-task-form";
import { RunTaskChecksButton } from "@/app/admin/operations/components/run-task-checks-button";
import { TaskCloseForm } from "@/components/task-close-form";
import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";
import { requireRole } from "@/server/auth/current-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { dateToKey } from "@/server/schedule/generation";
import { getOperationalCenter, requiresCloseComment } from "@/server/tasks/task-service";
import { listUsers } from "@/server/users/user-service";

type OperationalCenter = Awaited<ReturnType<typeof getOperationalCenter>>;
type OperationalTask = OperationalCenter["tasks"][number];

const priorityClassName: Record<string, string> = {
  CRITICAL: "bg-[#f8d8d4] text-[#8f1d17]",
  HIGH: "bg-[#f7e4d1] text-[#7a3f0d]",
  MEDIUM: "bg-[#e6eff8] text-[#214f78]",
  LOW: "bg-[#dff1ea] text-[#075a3d]"
};

export default async function OperationsPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [center, users] = await Promise.all([getOperationalCenter(currentUser), listUsers(currentUser)]);
  const metrics = [
    { label: "Критичные", value: center.counts.criticalTasks, icon: ShieldAlert, tone: "critical" },
    { label: "Высокие", value: center.counts.highTasks, icon: AlertTriangle, tone: "warning" },
    { label: "Занятия сегодня", value: center.counts.todayLessons, icon: CalendarDays, tone: "neutral" },
    { label: "Табели не закрыты", value: center.counts.unfilledLessons, icon: ClipboardList, tone: "critical" },
    { label: "Без абонемента", value: center.counts.childrenWithoutActiveSubscription, icon: WalletCards, tone: "critical" },
    { label: "Долг", value: center.counts.childrenWithDebt, icon: UserMinus, tone: "warning" },
    { label: "Недопуск", value: center.counts.notAdmittedChildren, icon: ShieldAlert, tone: "critical" },
    { label: "Справки", value: center.counts.pendingCertificates, icon: FileCheck2, tone: "warning" },
    { label: "Переносы", value: center.counts.availableMakeups, icon: TicketCheck, tone: "neutral" },
    { label: "Переполнены", value: center.counts.groupsOverCapacity, icon: Users, tone: "warning" }
  ];

  return (
    <div className="grid gap-6">
      <section className="min-w-0">
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-06</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Операционный центр</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Задачи, риски и ручные проверки на сегодня: {formatDate(center.today)}.
            </p>
          </div>
          <span className="badge bg-[#e6eff8] text-[#214f78]">Открыто задач: {center.tasks.length}</span>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={cn("panel grid min-w-0 gap-2 p-4", metric.tone === "critical" && metric.value > 0 ? "border-[#efb5ae] bg-[#fff4f2]" : null)}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--muted)]">{metric.label}</span>
                <Icon className={cn(metric.tone === "critical" && metric.value > 0 ? "text-[var(--danger)]" : "text-[var(--accent)]")} aria-hidden="true" size={18} />
              </div>
              <span className="text-3xl font-bold">{metric.value}</span>
            </div>
          );
        })}
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ListChecks className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Задачи в работе
            </h2>
            <span className="text-sm font-semibold text-[var(--muted)]">critical/high и задачи со сроком до конца дня</span>
          </div>
          {center.tasks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--muted)]">Открытых операционных задач нет.</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Задача</th>
                    <th>Адресат</th>
                    <th>Связь</th>
                    <th>Срок</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {center.tasks.map((task) => (
                    <tr key={task.id} className={task.priority === "CRITICAL" ? "bg-[#fff4f2]" : undefined}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityBadge priority={task.priority} />
                          <span className="badge bg-[#e6eff8] text-[#214f78]">{labelForEnum(task.type)}</span>
                        </div>
                        <div className="mt-2 font-semibold">{task.title}</div>
                        {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
                      </td>
                      <td>{task.assigneeUser?.displayName ?? "Не назначено"}</td>
                      <td>{relatedLabel(task)}</td>
                      <td>{task.dueAt ? formatDateTime(task.dueAt) : "Без срока"}</td>
                      <td>
                        <TaskCloseForm taskId={task.id} requiresComment={requiresCloseComment(task)} allowCancel />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <ManualTaskForm users={users} />
          <RunTaskChecksButton />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <InfoPanel title="Сегодняшние занятия" empty="На сегодня занятий нет.">
          {center.widgets.todayLessons.map((lesson) => (
            <ListRow key={lesson.id} title={lesson.group.name} meta={`${lesson.startTime}-${lesson.endTime} · ${lesson.coachName} · ${labelForEnum(lesson.status)}`} />
          ))}
        </InfoPanel>

        <InfoPanel title="Табели без отметок" empty="Незаполненных табелей нет.">
          {center.widgets.unfilledLessons.map((lesson) => (
            <ListRow key={lesson.id} title={lesson.group.name} meta={`${formatDate(lesson.lessonDate)} · ${lesson.startTime}-${lesson.endTime} · ${labelForEnum(lesson.status)}`} />
          ))}
        </InfoPanel>

        <InfoPanel title="Деньги и допуск" empty="Детей с долгом, недопуском или без абонемента не найдено.">
          {center.widgets.childrenWithoutActiveSubscription.map((child) => (
            <ListRow key={`sub-${child.id}`} title={child.fullName} meta={`Нет активного абонемента · ${child.currentGroup?.name ?? "без группы"}`} />
          ))}
          {center.widgets.childrenWithDebt.map((child) => (
            <ListRow key={`debt-${child.id}`} title={child.fullName} meta={`Баланс: ${child.cachedLessonBalance} · ${child.currentGroup?.name ?? "без группы"}`} />
          ))}
          {center.widgets.notAdmittedChildren.map((child) => (
            <ListRow key={`admission-${child.id}`} title={child.fullName} meta={`Недопуск · баланс ${child.cachedLessonBalance} · ${child.currentGroup?.name ?? "без группы"}`} />
          ))}
        </InfoPanel>

        <InfoPanel title="Справки и переносы" empty="Нет ожидающих справок и доступных переносов.">
          {center.widgets.pendingCertificates.map((record) => (
            <ListRow key={`cert-${record.id}`} title={record.child.fullName} meta={`Справка · ${record.lesson.group.name} · ${formatDate(record.lesson.lessonDate)}`} />
          ))}
          {center.widgets.availableMakeups.map((makeup) => (
            <ListRow key={`makeup-${makeup.id}`} title={makeup.child.fullName} meta={`Перенос ${labelForEnum(makeup.reason)} · ${makeup.group.name}`} />
          ))}
        </InfoPanel>

        <InfoPanel title="Группы сверх лимита" empty="Переполненных групп нет.">
          {center.widgets.groupsOverCapacity.map((group) => (
            <ListRow key={group.id} title={group.name} meta={`Активных детей: ${group.activeChildrenCount}. Лимит: ${group.capacityLimit}.`} />
          ))}
        </InfoPanel>

        <InfoPanel title="Пробные занятия" empty="Задач по пробным занятиям пока нет.">
          {center.widgets.trialsToProcess.map((task) => (
            <ListRow key={task.id} title={task.title} meta={task.description ?? labelForEnum(task.type)} />
          ))}
        </InfoPanel>
      </section>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={cn("badge", priorityClassName[priority] ?? "bg-[#ececec] text-[#555]")}>{labelForEnum(priority)}</span>;
}

function InfoPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  const isEmpty = items.length === 0;

  return (
    <div className="panel min-w-0">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {isEmpty ? <p className="px-5 py-4 text-sm text-[var(--muted)]">{empty}</p> : <div className="grid gap-3 p-4">{items}</div>}
    </div>
  );
}

function ListRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-3">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{meta}</div>
    </div>
  );
}

function relatedLabel(task: OperationalTask) {
  if (task.child) {
    return `Ребёнок: ${task.child.fullName}`;
  }

  if (task.group) {
    return `Группа: ${task.group.name}`;
  }

  if (task.relatedEntityType && task.relatedEntityId) {
    return `${task.relatedEntityType}`;
  }

  return "Не указано";
}

function formatDate(value: string | Date) {
  const key = value instanceof Date ? dateToKey(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(`${key}T00:00:00.000Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
