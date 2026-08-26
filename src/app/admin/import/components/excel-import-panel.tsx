"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, KeyRound, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { labelForEnum } from "@/lib/labels";

type PreviewSheet = {
  rows: number;
  errors: number;
  warnings: number;
  imported: boolean;
};

type Preview = {
  totalRows: number;
  errorCount: number;
  warningCount: number;
  canConfirm: boolean;
  sheets: Record<string, PreviewSheet>;
};

type ImportIssue = {
  id: string;
  severity: string;
  sheetName: string;
  rowNumber: number | null;
  fieldName: string | null;
  errorMessage: string;
  createdAt: string;
};

type ImportBatch = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  preview: Preview | null;
  result: unknown;
  errorsCount: number;
  uploadedBy: { displayName: string; login: string } | null;
  errors: ImportIssue[];
  createdAt: string;
  updatedAt: string;
};

type OneTimePassword = {
  coachCode: string;
  login: string;
  temporaryPassword: string;
};

type ExcelImportPanelProps = {
  initialBatches: ImportBatch[];
};

export function ExcelImportPanel({ initialBatches }: ExcelImportPanelProps) {
  const router = useRouter();
  const [batches, setBatches] = useState(initialBatches);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(initialBatches[0] ?? null);
  const [oneTimePasswords, setOneTimePasswords] = useState<OneTimePassword[]>([]);
  const [message, setMessage] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  async function validateFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setOneTimePasswords([]);
    setIsValidating(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/import/excel/validate", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; batch?: ImportBatch };

      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Не удалось проверить файл.");
      }

      setSelectedBatch(payload.batch);
      setBatches((current) => [payload.batch!, ...current.filter((batch) => batch.id !== payload.batch!.id)]);
      setMessage(payload.batch.preview?.canConfirm ? "Файл прошёл валидацию." : "Файл содержит критичные ошибки.");
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось проверить файл.");
    } finally {
      setIsValidating(false);
    }
  }

  async function confirmBatch() {
    if (!selectedBatch) {
      return;
    }

    setMessage("");
    setOneTimePasswords([]);
    setIsConfirming(true);

    try {
      const response = await fetch("/api/import/excel/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: selectedBatch.id })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        batch?: ImportBatch;
        oneTimePasswords?: OneTimePassword[];
      };

      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Не удалось подтвердить импорт.");
      }

      setSelectedBatch(payload.batch);
      setOneTimePasswords(payload.oneTimePasswords ?? []);
      setBatches((current) => current.map((batch) => (batch.id === payload.batch!.id ? payload.batch! : batch)));
      setMessage("Импорт завершён.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось подтвердить импорт.");
    } finally {
      setIsConfirming(false);
    }
  }

  async function loadBatch(batchId: string) {
    setMessage("");

    try {
      const response = await fetch(`/api/import/batches/${batchId}`);
      const payload = (await response.json().catch(() => ({}))) as { error?: string; batch?: ImportBatch };

      if (!response.ok || !payload.batch) {
        throw new Error(payload.error ?? "Не удалось открыть ImportBatch.");
      }

      setSelectedBatch(payload.batch);
      setOneTimePasswords([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось открыть ImportBatch.");
    }
  }

  const canConfirm = selectedBatch?.status === "READY_TO_IMPORT" && selectedBatch.preview?.canConfirm;

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form className="panel grid content-start gap-4 p-5" onSubmit={validateFile}>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileUp aria-hidden="true" size={18} />
            Загрузка
          </h2>
          <label className="label">
            Файл
            <input className="field py-2" name="file" type="file" accept=".xlsx" required disabled={isValidating || isConfirming} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isValidating || isConfirming}>
              {isValidating ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <Search aria-hidden="true" size={16} />}
              Проверить
            </Button>
            <Button type="button" variant="secondary" disabled={!canConfirm || isConfirming || isValidating} onClick={confirmBatch}>
              {isConfirming ? <Loader2 aria-hidden="true" className="animate-spin" size={16} /> : <CheckCircle2 aria-hidden="true" size={16} />}
              Подтвердить
            </Button>
          </div>
          {message ? (
            <div className="rounded-lg border border-[var(--line)] bg-[#f8faf8] px-4 py-3 text-sm font-semibold text-[var(--muted)]">{message}</div>
          ) : null}
        </form>

        <div className="panel min-w-0">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="text-lg font-bold">Пакеты импорта</h2>
          </div>
          <div className="grid max-h-[420px] gap-2 overflow-auto p-3">
            {batches.length === 0 ? <p className="px-2 py-3 text-sm text-[var(--muted)]">Импортов пока нет.</p> : null}
            {batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                className={cn(
                  "grid rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-left text-sm hover:border-[var(--accent)]",
                  selectedBatch?.id === batch.id ? "border-[var(--accent)] bg-[#eef8f7]" : null
                )}
                onClick={() => loadBatch(batch.id)}
              >
                <span className="truncate font-semibold">{batch.fileName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <StatusPill status={batch.status} />
                  {formatDateTime(batch.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedBatch ? (
        <section className="grid gap-6">
          <BatchSummary batch={selectedBatch} />
          {oneTimePasswords.length > 0 ? <OneTimePasswordsTable passwords={oneTimePasswords} /> : null}
          <PreviewTable batch={selectedBatch} />
          <IssueTable issues={selectedBatch.errors} errorsCount={selectedBatch.errorsCount} />
        </section>
      ) : null}
    </div>
  );
}

function BatchSummary({ batch }: { batch: ImportBatch }) {
  const result = readResultCounts(batch.result);

  return (
    <div className="panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{batch.fileName}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {batch.uploadedBy?.displayName ?? labelForEnum("SUPER_ADMIN")} · {formatDateTime(batch.createdAt)}
          </p>
        </div>
        <StatusPill status={batch.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Строк" value={batch.totalRows} />
        <Metric label="Ошибок" value={batch.preview?.errorCount ?? batch.failedRows} tone={(batch.preview?.errorCount ?? batch.failedRows) > 0 ? "danger" : "success"} />
        <Metric label="Предупреждений" value={batch.preview?.warningCount ?? 0} tone={(batch.preview?.warningCount ?? 0) > 0 ? "warning" : "neutral"} />
      </div>
      {result ? (
        <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[#f8faf8] p-4 text-sm">
          <div className="font-bold">Создано</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(result).map(([key, value]) => (
              <span key={key} className="font-semibold text-[var(--muted)]">
                {resultLabel(key)}: {value}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewTable({ batch }: { batch: ImportBatch }) {
  const preview = batch.preview;

  if (!preview) {
    return null;
  }

  return (
    <div className="panel">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="text-lg font-bold">Предпросмотр</h2>
      </div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>Лист</th>
              <th>Строки</th>
              <th>Ошибки</th>
              <th>Предупреждения</th>
              <th>Импорт</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(preview.sheets).map(([sheetName, sheet]) => (
              <tr key={sheetName}>
                <td className="font-semibold">{sheetName}</td>
                <td>{sheet.rows}</td>
                <td className={sheet.errors > 0 ? "font-bold text-[var(--danger)]" : undefined}>{sheet.errors}</td>
                <td className={sheet.warnings > 0 ? "font-bold text-[var(--warning)]" : undefined}>{sheet.warnings}</td>
                <td>{sheet.imported ? "Да" : "Нет"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueTable({ issues, errorsCount }: { issues: ImportIssue[]; errorsCount: number }) {
  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <AlertTriangle aria-hidden="true" size={18} />
          Ошибки и предупреждения
        </h2>
        <span className="text-sm font-semibold text-[var(--muted)]">Всего: {errorsCount}</span>
      </div>
      {issues.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--muted)]">Нет сохранённых ошибок.</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Лист</th>
                <th>Строка</th>
                <th>Поле</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td>
                    <span className={cn("badge", issue.severity === "ERROR" ? "bg-[#f8d8d4] text-[#8f1d17]" : "bg-[#f7e4d1] text-[#7a3f0d]")}>
                      {labelForEnum(issue.severity)}
                    </span>
                  </td>
                  <td className="font-semibold">{issue.sheetName}</td>
                  <td>{issue.rowNumber ?? "-"}</td>
                  <td>{issue.fieldName ?? "-"}</td>
                  <td>{issue.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OneTimePasswordsTable({ passwords }: { passwords: OneTimePassword[] }) {
  return (
    <div className="panel border-[#efc27a] bg-[#fff8ec]">
      <div className="border-b border-[#efc27a] px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#7a3f0d]">
          <KeyRound aria-hidden="true" size={18} />
          Сгенерированные пароли
        </h2>
      </div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              <th>coach_code</th>
              <th>login</th>
              <th>temporary_password</th>
            </tr>
          </thead>
          <tbody>
            {passwords.map((password) => (
              <tr key={password.coachCode}>
                <td className="font-semibold">{password.coachCode}</td>
                <td>{password.login}</td>
                <td className="font-mono font-semibold">{password.temporaryPassword}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-3">
      <div className="text-sm font-semibold text-[var(--muted)]">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "success" ? "text-[var(--success)]" : null,
          tone === "warning" ? "text-[var(--warning)]" : null,
          tone === "danger" ? "text-[var(--danger)]" : null
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === "READY_TO_IMPORT" || status === "IMPORTED"
      ? "bg-[#dff1ea] text-[#075a3d]"
      : status === "VALIDATION_FAILED" || status === "FAILED"
        ? "bg-[#f8d8d4] text-[#8f1d17]"
        : "bg-[#e6eff8] text-[#214f78]";

  return <span className={cn("badge", className)}>{labelForEnum(status)}</span>;
}

function readResultCounts(result: unknown) {
  if (!result || typeof result !== "object" || !("counts" in result)) {
    return null;
  }

  const counts = (result as { counts?: unknown }).counts;

  if (!counts || typeof counts !== "object") {
    return null;
  }

  return counts as Record<string, number>;
}

function resultLabel(key: string) {
  const labels: Record<string, string> = {
    branchesCreated: "Филиалы",
    coachUsersCreated: "Пользователи",
    coachProfilesCreated: "Тренеры",
    groupsCreated: "Группы",
    parentsCreated: "Родители",
    childrenCreated: "Дети",
    scheduleTemplatesCreated: "Расписание",
    lessonsCreated: "Занятия"
  };

  return labels[key] ?? key;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
