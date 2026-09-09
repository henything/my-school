import { type ReactNode } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  Link2,
  ListChecks,
  ShieldAlert,
  TicketCheck,
  UserMinus,
  UserRound,
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
  CRITICAL: "bg-[var(--red-soft)] text-[var(--danger-strong)]",
  HIGH: "bg-[var(--yellow-soft)] text-[var(--warning-strong)]",
  MEDIUM: "bg-[var(--blue-soft)] text-[var(--accent-strong)]",
  LOW: "bg-[var(--green-soft)] text-[var(--success-strong)]"
};

export default async function OperationsPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [center, users] = await Promise.all([getOperationalCenter(currentUser), listUsers(currentUser)]);
  const metrics = [
    { label: "Критичные", value: center.counts.criticalTasks, icon: ShieldAlert, tone: "danger" },
    { label: "Высокие", value: center.counts.highTasks, icon: AlertTriangle, tone: "warning" },
    { label: "Занятия сегодня", value: center.counts.todayLessons, icon: CalendarDays, tone: "info" },
    { label: "Табели не закрыты", value: center.counts.unfilledLessons, icon: ClipboardList, tone: "danger" },
    { label: "Без абонемента", value: center.counts.childrenWithoutActiveSubscription, icon: WalletCards, tone: "danger" },
    { label: "Долг", value: center.counts.childrenWithDebt, icon: UserMinus, tone: "warning" },
    { label: "Недопуск", value: center.counts.notAdmittedChildren, icon: ShieldAlert, tone: "danger" },
    { label: "Справки", value: center.counts.pendingCertificates, icon: FileCheck2, tone: "warning" },
    { label: "Переносы", value: center.counts.availableMakeups, icon: TicketCheck, tone: "success" },
    { label: "Переполнены", value: center.counts.groupsOverCapacity, icon: Users, tone: "warning" }
  ];

  return (
    <div className="grid gap-6">
      <section className="brand-hero px-5 pb-20 pt-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-extrabold uppercase text-white/75">Сегодня нужно закрыть главное</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-[1.03] sm:text-5xl">Операционный центр</h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/80">
              Задачи, риски и ручные проверки на сегодня: {formatDate(center.today)}.
            </p>
          </div>
          <span className="brand-pill">Открыто задач: {center.tasks.length}</span>
        </div>
      </section>

      <section className="relative z-10 -mt-14 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="metric-card grid min-w-0 gap-2 p-4" data-tone={metric.tone}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--muted)]">{metric.label}</span>
                <Icon
                  className={cn(
                    metric.tone === "danger"
                      ? "text-[var(--danger)]"
                      : metric.tone === "warning"
                        ? "text-[var(--warning-strong)]"
                        : metric.tone === "success"
                          ? "text-[var(--success-strong)]"
                          : "text-[var(--accent)]"
                  )}
                  aria-hidden="true"
                  size={18}
                />
              </div>
              <span className="text-3xl font-extrabold">{metric.value}</span>
            </div>
          );
        })}
      </section>

      <section className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AccordionPanel
          title="Задачи в работе"
          count={center.tasks.length}
          icon={<ListChecks className="text-[var(--accent)]" aria-hidden="true" size={18} />}
          defaultOpen={center.tasks.length > 0 && center.tasks.length <= 3}
        >
          {center.tasks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--muted)]">Открытых операционных задач нет.</p>
          ) : (
            <div className="grid gap-3 p-4">
              {center.tasks.map((task) => (
                <article
                  key={task.id}
                  className={cn(
                    "grid min-w-0 gap-4 rounded-lg border bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_280px]",
                    task.priority === "CRITICAL" ? "border-[#ffb3bd] bg-[var(--red-soft)]" : "border-[var(--line)]"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={task.priority} />
                      <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{labelForEnum(task.type)}</span>
                    </div>
                    <h3 className="mt-3 text-base font-extrabold leading-snug">{task.title}</h3>
                    {task.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{task.description}</p> : null}
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                      <TaskMeta icon={<UserRound aria-hidden="true" size={15} />} label="Ответственный" value={task.assigneeUser?.displayName ?? "Не назначено"} />
                      <TaskMeta icon={<CalendarDays aria-hidden="true" size={15} />} label="Срок" value={task.dueAt ? formatDateTime(task.dueAt) : "Без срока"} />
                      <TaskMeta icon={<Link2 aria-hidden="true" size={15} />} label="Связь" value={relatedLabel(task)} />
                    </dl>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-white/85 p-3">
                    <div className="mb-3 text-sm font-bold text-[var(--muted)]">Закрытие задачи</div>
                    <TaskCloseForm taskId={task.id} requiresComment={requiresCloseComment(task)} allowCancel />
                  </div>
                </article>
              ))}
            </div>
          )}
        </AccordionPanel>

        <div className="grid min-w-0 content-start gap-6">
          <div className="panel overflow-hidden">
            <div className="brand-image-panel h-64">
              <Image src="/brand/schedule-reference.png" alt="" width={956} height={1424} className="h-full w-full object-cover object-top" priority />
            </div>
            <div className="p-4">
              <div className="text-lg font-extrabold">Расписание занятий</div>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Быстрый вход в сегодняшнюю операционку: кто занимается, где риски и что нужно закрыть.</p>
            </div>
          </div>
          <ManualTaskForm users={users} />
          <RunTaskChecksButton />
        </div>
      </section>

    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={cn("badge", priorityClassName[priority] ?? "bg-[#ececec] text-[#555]")}>{labelForEnum(priority)}</span>;
}

function TaskMeta({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase text-[var(--muted)]">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate font-semibold text-[var(--foreground)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function AccordionPanel({
  title,
  count,
  icon,
  children,
  defaultOpen = false
}: {
  title: string;
  count: number;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="panel accordion-panel min-w-0" open={defaultOpen}>
      <summary className="accordion-summary flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-lg font-bold">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{count}</span>
          <ChevronDown className="accordion-chevron text-[var(--muted)]" aria-hidden="true" size={18} />
        </span>
      </summary>
      <div className="border-t border-[var(--line)]">{children}</div>
    </details>
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
