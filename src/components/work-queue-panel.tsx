import { AlertTriangle, ArrowRightCircle, Clock3, UserRound } from "lucide-react";
import { TaskCloseForm } from "@/components/task-close-form";
import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";

type WorkQueueTask = {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  assigneeUser: { displayName: string; login: string } | null;
  child: { fullName: string } | null;
  group: { name: string } | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
};

type WorkQueuePanelProps = {
  title: string;
  subtitle: string;
  tasks: WorkQueueTask[];
  tone?: "critical" | "warning";
};

const priorityClassName: Record<string, string> = {
  CRITICAL: "bg-[var(--red-soft)] text-[var(--danger-strong)]",
  HIGH: "bg-[var(--yellow-soft)] text-[var(--warning-strong)]",
  MEDIUM: "bg-[var(--blue-soft)] text-[var(--accent-strong)]",
  LOW: "bg-[var(--green-soft)] text-[var(--success-strong)]"
};

export function WorkQueuePanel({ title, subtitle, tasks, tone = "critical" }: WorkQueuePanelProps) {
  if (tasks.length === 0) {
    return null;
  }

  const isCritical = tone === "critical";

  return (
    <section
      className={cn(
        "panel overflow-hidden",
        isCritical ? "border-[#ffb3bd] bg-[var(--red-soft)]" : "border-[#ffe08a] bg-[var(--yellow-soft)]"
      )}
    >
      <div className="grid gap-4 border-b border-current/10 px-5 py-5 lg:grid-cols-[96px_minmax(0,1fr)_220px] lg:items-center">
        <div className={cn("flex h-20 w-20 items-center justify-center rounded-lg text-4xl font-extrabold", isCritical ? "bg-white text-[var(--danger-strong)]" : "bg-white text-[var(--warning-strong)]")}>
          {tasks.length}
        </div>
        <div className="min-w-0">
          <h2 className={cn("flex items-center gap-2 text-xl font-extrabold", isCritical ? "text-[var(--danger-strong)]" : "text-[var(--warning-strong)]")}>
            <AlertTriangle aria-hidden="true" size={20} />
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="rounded-lg border border-current/15 bg-white/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ArrowRightCircle aria-hidden="true" size={16} />
            Следующее действие
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">Закрыть, отменить или оставить комментарий по задаче.</p>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {tasks.map((task) => (
          <article key={task.id} className="grid gap-4 rounded-lg border border-white bg-white px-4 py-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("badge", priorityClassName[task.priority] ?? "bg-[#ececec] text-[#555]")}>{labelForEnum(task.priority)}</span>
                <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{labelForEnum(task.type)}</span>
              </div>
              <h3 className="mt-3 text-base font-bold">{task.title}</h3>
              {task.description ? <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{task.description}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--muted)]">
                <span className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[var(--panel-soft)] px-2">
                  <UserRound aria-hidden="true" size={14} />
                  {task.assigneeUser?.displayName ?? "Не назначено"}
                </span>
                <span className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[var(--panel-soft)] px-2">
                  <Clock3 aria-hidden="true" size={14} />
                  {task.dueAt ? new Date(task.dueAt).toLocaleString("ru-RU") : "Без срока"}
                </span>
                <span className="inline-flex min-h-8 items-center rounded-md bg-[var(--panel-soft)] px-2">{relatedLabel(task)}</span>
              </div>
            </div>
            <TaskCloseForm taskId={task.id} requiresComment={requiresWorkQueueComment(task)} allowCancel />
          </article>
        ))}
      </div>
    </section>
  );
}

function requiresWorkQueueComment(task: Pick<WorkQueueTask, "priority" | "type">) {
  return (
    task.priority === "CRITICAL" ||
    task.type === "CHILD_NOT_ADMITTED" ||
    task.type === "CHILD_TOOK_CREDIT_LESSON" ||
    task.type === "ATTENDANCE_NOT_FILLED"
  );
}

function relatedLabel(task: WorkQueueTask) {
  if (task.child) {
    return `Ребёнок: ${task.child.fullName}`;
  }

  if (task.group) {
    return `Группа: ${task.group.name}`;
  }

  if (task.relatedEntityType && task.relatedEntityId) {
    return task.relatedEntityType;
  }

  return "Связь не указана";
}
