import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CircleX,
  ClipboardCheck,
  ListChecks,
  ShieldCheck,
  Wrench
} from "lucide-react";
import { TaskCloseForm } from "@/components/task-close-form";
import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";
import { requireRole } from "@/server/auth/current-user";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { getStabilizationDashboard, type StabilizationStatus } from "@/server/stabilization/stabilization-service";
import { requiresCloseComment } from "@/server/tasks/task-service";

const statusConfig: Record<StabilizationStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  STABLE: { label: "Стабильно", className: "bg-[var(--green-soft)] text-[var(--success-strong)]", icon: CheckCircle2 },
  WATCH: { label: "Нужна ручная проверка", className: "bg-[var(--yellow-soft)] text-[var(--warning-strong)]", icon: CircleAlert },
  BLOCKED: { label: "Блокер", className: "bg-[var(--red-soft)] text-[var(--danger-strong)]", icon: CircleX }
};

const metricToneClassName: Record<string, string> = {
  success: "border-[var(--brand-green)] bg-[var(--green-soft)]",
  warning: "border-[var(--brand-yellow)] bg-[var(--yellow-soft)]",
  danger: "border-[#ffb3bd] bg-[var(--red-soft)]",
  neutral: "border-[var(--line)] bg-white"
};

const priorityClassName: Record<string, string> = {
  CRITICAL: "bg-[var(--red-soft)] text-[var(--danger-strong)]",
  HIGH: "bg-[var(--yellow-soft)] text-[var(--warning-strong)]",
  MEDIUM: "bg-[var(--blue-soft)] text-[var(--accent-strong)]",
  LOW: "bg-[var(--green-soft)] text-[var(--success-strong)]"
};

export default async function StabilizationPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const dashboard = await getStabilizationDashboard(currentUser);

  return (
    <div className="grid gap-6">
      <section className="min-w-0">
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-11</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Стабилизация пилота</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Phase 12: баги, UX, балансы, переносы, допуск, задачи и ручной регресс перед полным rollout.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">Дата: {dashboard.today}</span>
            <StatusBadge status={dashboard.overallStatus} />
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.metrics.map((metric) => (
          <div key={metric.label} className={`panel min-w-0 border p-4 ${metricToneClassName[metric.tone]}`}>
            <div className="text-sm font-semibold text-[var(--muted)]">{metric.label}</div>
            <div className="mt-2 text-2xl font-bold">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="grid min-w-0 gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-[var(--accent)]" aria-hidden="true" size={18} />
          <h2 className="text-lg font-bold">Stabilization checks</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {dashboard.sections.map((section) => (
            <article key={section.id} className="panel min-w-0 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{section.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{section.description}</p>
                </div>
                <StatusBadge status={section.status} />
              </div>
              <div className="mt-4 grid gap-2">
                {section.checks.map((check) => (
                  <div key={check.id} className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                    <CheckIcon status={check.status} required={check.required} />
                    <div className="min-w-0">
                      <div className="font-semibold">{check.label}</div>
                      <div className="mt-1 text-[var(--muted)]">{check.detail}</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">{check.required ? "обязательно" : "ручная/операционная проверка"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Wrench className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Pilot issues
            </h2>
            <span className="text-sm font-semibold text-[var(--muted)]">Открытые `[Pilot]` задачи</span>
          </div>
          {dashboard.openPilotIssues.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--muted)]">Открытых pilot issue задач нет.</p>
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Задача</th>
                    <th>Связь</th>
                    <th>Создана</th>
                    <th>Закрытие</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.openPilotIssues.map((task) => (
                    <tr key={task.id} className={task.priority === "CRITICAL" ? "bg-[var(--red-soft)]" : undefined}>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("badge", priorityClassName[task.priority])}>{labelForEnum(task.priority)}</span>
                          <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{labelForEnum(task.status)}</span>
                        </div>
                        <div className="mt-2 font-semibold">{task.title}</div>
                        {task.description ? <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p> : null}
                        {task.assigneeName ? <p className="mt-1 text-xs text-[var(--muted)]">Ответственный: {task.assigneeName}</p> : null}
                      </td>
                      <td>{relatedLabel(task.childName, task.groupName)}</td>
                      <td>{formatDateTime(task.createdAt)}</td>
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

        <div className="grid min-w-0 content-start gap-4">
          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Activity className="text-[var(--accent)]" aria-hidden="true" size={18} />
              MVP target
            </h2>
            <div className="mt-4 text-4xl font-bold">{dashboard.attendanceCompletionRate === null ? "n/a" : `${dashboard.attendanceCompletionRate}%`}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">95%+ занятий закрываются табелем в день проведения.</p>
          </div>

          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardCheck className="text-[var(--accent)]" aria-hidden="true" size={18} />
              Manual regression
            </h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--muted)]">
              {dashboard.manualRegression.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ListChecks className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden="true" size={14} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: StabilizationStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`badge ${config.className}`}>
      <Icon aria-hidden="true" size={14} />
      {config.label}
    </span>
  );
}

function CheckIcon({ status, required }: { status: StabilizationStatus; required: boolean }) {
  if (status === "STABLE") {
    return <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--success-strong)]" aria-hidden="true" size={16} />;
  }

  if (status === "BLOCKED" || required) {
    return <CircleX className="mt-0.5 shrink-0 text-[var(--danger-strong)]" aria-hidden="true" size={16} />;
  }

  return <CircleAlert className="mt-0.5 shrink-0 text-[var(--warning-strong)]" aria-hidden="true" size={16} />;
}

function relatedLabel(childName: string | null, groupName: string | null) {
  if (childName) {
    return `Ребёнок: ${childName}`;
  }

  if (groupName) {
    return `Группа: ${groupName}`;
  }

  return "Не указано";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
