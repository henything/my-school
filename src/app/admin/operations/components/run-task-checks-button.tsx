"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type TaskChecksResult = {
  closedCount: number;
  missingSubscriptionCount: number;
  overCapacityCount: number;
};

export function RunTaskChecksButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function runChecks() {
    setMessage("");
    setIsRunning(true);

    try {
      const response = await fetch("/api/jobs/task-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; result?: TaskChecksResult };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Не удалось запустить проверки.");
      }

      setMessage(
        `Закрыто: ${payload.result.closedCount}. Без абонемента: ${payload.result.missingSubscriptionCount}. Переполнений: ${payload.result.overCapacityCount}.`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось запустить проверки.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="panel grid gap-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RefreshCcw aria-hidden="true" size={18} />
        Проверки задач
      </h2>
      <p className="text-sm leading-6 text-[var(--muted)]">
        Обновляет системные задачи: закрывает решенные, создает задачи по детям без активного абонемента и переполненным группам.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={runChecks} disabled={isRunning}>
          {isRunning ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : null}
          Запустить
        </Button>
        {message ? <span className="text-sm font-semibold text-[var(--muted)]">{message}</span> : null}
      </div>
    </div>
  );
}
