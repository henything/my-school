import { UserRoundPlus } from "lucide-react";
import { CreateTrialForm, ConvertTrialForm, TransferTrialForm } from "@/app/admin/trials/components/trial-admin-forms";
import { StatusBadge } from "@/components/badges";
import { requireRole } from "@/server/auth/current-user";
import { listGroups } from "@/server/groups/group-service";
import { ADMIN_ROLES } from "@/server/rbac/rbac";
import { listLessons } from "@/server/schedule/lesson-service";
import { listTrials } from "@/server/trials/trial-service";

export default async function TrialsPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const [trials, lessons, groups] = await Promise.all([listTrials(currentUser), listLessons(currentUser), listGroups(currentUser)]);
  const activeGroups = groups.filter((group) => group.status !== "ARCHIVED");
  const pendingCount = trials.filter((trial) => trial.status === "TRIAL_ATTENDED" || trial.status === "TRIAL_NO_SHOW").length;

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">DEV-07</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Пробные занятия</h1>
          </div>
          <span className="badge bg-[#f7e4d1] text-[#7a3f0d]">К обработке: {pendingCount}</span>
        </div>
      </section>

      <CreateTrialForm lessons={lessons} />

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <UserRoundPlus className="text-[var(--accent)]" aria-hidden="true" size={18} />
            Список пробников
          </h2>
          <span className="text-sm font-semibold text-[var(--muted)]">{trials.length}</span>
        </div>
        {trials.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--muted)]">Пробников пока нет.</p>
        ) : (
          <div className="grid gap-4 p-4">
            {trials.map((trial) => {
              const isClosed = trial.status === "TRANSFERRED_TO_ADMIN" || trial.status === "CONVERTED_TO_ACTIVE";

              return (
                <article key={trial.id} className={trial.status === "TRIAL_ATTENDED" || trial.status === "TRIAL_NO_SHOW" ? "rounded-lg border border-[#efc27a] bg-[#fff8ec] p-4" : "rounded-lg border border-[var(--line)] bg-white p-4"}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold">{trial.childName ?? "Пробник без имени"}</h3>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                        <span>
                          {trial.lesson.lessonDate} {trial.lesson.startTime}-{trial.lesson.endTime}
                        </span>
                        <span>{trial.group.name}</span>
                        <span>{trial.coach.displayName}</span>
                        {trial.parentPhone ? <span>{trial.parentPhone}</span> : null}
                        {trial.convertedChild ? <span>Ребёнок: {trial.convertedChild.fullName}</span> : null}
                      </div>
                      {trial.comment ? <p className="mt-2 text-sm text-[var(--muted)]">{trial.comment}</p> : null}
                    </div>
                    <StatusBadge status={trial.status} />
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <ConvertTrialForm trial={trial} groups={activeGroups} />
                    <TransferTrialForm trialId={trial.id} disabled={isClosed} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
