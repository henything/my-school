import { Activity, AlertTriangle, CheckCircle2, CircleAlert, CircleX, ClipboardCheck, Clock3, ListChecks, Rocket, UserRound } from "lucide-react";
import { PilotIssueForm } from "@/app/admin/readiness/components/pilot-issue-form";
import { requireRole } from "@/server/auth/current-user";
import { getReadinessDashboard, type ReadinessGateStatus } from "@/server/readiness/readiness-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";

const statusConfig: Record<ReadinessGateStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  READY: { label: "Готово", className: "bg-[var(--green-soft)] text-[var(--success-strong)]", icon: CheckCircle2 },
  NEEDS_ATTENTION: { label: "Нужна проверка", className: "bg-[var(--yellow-soft)] text-[var(--warning-strong)]", icon: CircleAlert },
  BLOCKED: { label: "Блокер", className: "bg-[var(--red-soft)] text-[var(--danger-strong)]", icon: CircleX }
};

const metricToneClassName: Record<string, string> = {
  success: "border-[var(--brand-green)] bg-[var(--green-soft)]",
  warning: "border-[var(--brand-yellow)] bg-[var(--yellow-soft)]",
  danger: "border-[#ffb3bd] bg-[var(--red-soft)]",
  neutral: "border-[var(--line)] bg-white"
};

export default async function ReadinessPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const dashboard = await getReadinessDashboard(currentUser);
  const blockers = dashboard.gates.flatMap((gate) =>
    gate.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        id: `${gate.id}-${check.id}`,
        gateTitle: gate.title,
        detail: check.detail,
        required: check.required
      }))
  );

  return (
    <div className="grid gap-6">
      <section className="min-w-0">
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-10</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Готовность к пилоту</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Gate 1-5, метрики пилота и чеклисты стабилизации перед внутренним rollout.
            </p>
          </div>
          <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">Дата: {dashboard.today}</span>
        </div>
      </section>

      {blockers.length > 0 ? (
        <section className="panel overflow-hidden border-[#d98e86] bg-[var(--red-soft)]">
          <div className="grid gap-4 border-b border-[#ffb3bd] px-5 py-5 lg:grid-cols-[96px_minmax(0,1fr)_220px] lg:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white text-4xl font-extrabold text-[var(--danger-strong)]">{blockers.length}</div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--danger-strong)]">
                <AlertTriangle aria-hidden="true" size={20} />
                Очередь блокеров пилота
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Незакрытые gate checks, которые мешают rollout или требуют ручного подтверждения.</p>
            </div>
            <div className="rounded-lg border border-[#ffb3bd] bg-white/80 px-4 py-3">
              <div className="text-sm font-bold">Следующее действие</div>
              <p className="mt-1 text-sm text-[var(--muted)]">Закрыть обязательные пункты, затем вернуться к Gate 5.</p>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {blockers.map((blocker) => (
              <article key={blocker.id} className="rounded-lg border border-white bg-white px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={blocker.required ? "badge bg-[var(--red-soft)] text-[var(--danger-strong)]" : "badge bg-[var(--yellow-soft)] text-[var(--warning-strong)]"}>
                    {blocker.required ? "обязательно" : "рекомендация"}
                  </span>
                  <span className="badge bg-[var(--blue-soft)] text-[var(--accent-strong)]">{blocker.gateTitle}</span>
                </div>
                <h3 className="mt-3 font-bold">{blocker.detail}</h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--muted)]">
                  <span className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[var(--panel-soft)] px-2">
                    <UserRound aria-hidden="true" size={14} />
                    Admin owner
                  </span>
                  <span className="inline-flex min-h-8 items-center gap-1 rounded-md bg-[var(--panel-soft)] px-2">
                    <Clock3 aria-hidden="true" size={14} />
                    До pilot rollout
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {dashboard.metrics.map((metric) => (
          <div key={metric.label} className={`panel min-w-0 border p-4 ${metricToneClassName[metric.tone]}`}>
            <div className="text-sm font-semibold text-[var(--muted)]">{metric.label}</div>
            <div className="mt-2 text-2xl font-bold">{metric.value}</div>
          </div>
        ))}
      </section>

      <section className="grid min-w-0 gap-4">
        <div className="flex items-center gap-2">
          <Rocket className="text-[var(--accent)]" aria-hidden="true" size={18} />
          <h2 className="text-lg font-bold">Release gates</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {dashboard.gates.map((gate) => (
            <article key={gate.id} className={`panel min-w-0 p-5 ${gate.status === "BLOCKED" ? "border-[#ffb3bd] bg-[var(--red-soft)]" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{gate.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{gate.description}</p>
                </div>
                <GateStatusBadge status={gate.status} />
              </div>
              <div className="mt-4 grid gap-2">
                {gate.checks.map((check) => (
                  <div key={check.id} className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                    {check.passed ? (
                      <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--success-strong)]" aria-hidden="true" size={16} />
                    ) : check.required ? (
                      <CircleX className="mt-0.5 shrink-0 text-[var(--danger-strong)]" aria-hidden="true" size={16} />
                    ) : (
                      <CircleAlert className="mt-0.5 shrink-0 text-[var(--warning-strong)]" aria-hidden="true" size={16} />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold">{check.detail}</div>
                      <div className="text-xs text-[var(--muted)]">{check.required ? "обязательно" : "рекомендация"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="text-[var(--accent)]" aria-hidden="true" size={18} />
            <h2 className="text-lg font-bold">Чеклисты пилота</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.manualSections.map((section) => (
              <article key={section.title} className="panel min-w-0 p-5">
                <h3 className="font-bold">{section.title}</h3>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--muted)]">
                  {section.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <ListChecks className="mt-1 shrink-0 text-[var(--accent)]" aria-hidden="true" size={14} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Activity className="text-[var(--accent)]" aria-hidden="true" size={18} />
              MVP target
            </h2>
            <div className="mt-4 text-4xl font-bold">{dashboard.attendanceCompletionRate === null ? "n/a" : `${dashboard.attendanceCompletionRate}%`}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">95%+ занятий с заполненной посещаемостью в день проведения.</p>
          </div>
          <PilotIssueForm titlePrefix={dashboard.pilotIssueDefaults.titlePrefix} defaultPriority={dashboard.pilotIssueDefaults.priority} />
        </div>
      </section>
    </div>
  );
}

function GateStatusBadge({ status }: { status: ReadinessGateStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={`badge ${config.className}`}>
      <Icon aria-hidden="true" size={14} />
      {config.label}
    </span>
  );
}
