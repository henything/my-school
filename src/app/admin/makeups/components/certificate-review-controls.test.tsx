// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CertificateReviewControls } from "./makeup-forms";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset(); });
const certificate = {
  id: "certificate", status: "PENDING", periodStart: "2026-10-27", periodEnd: "2026-10-29", originalFileName: "qa.png",
  comment: null, adminComment: null, createdAt: "2026-11-05T10:00:00Z", reviewedAt: null,
  child: { id: "child", fullName: "Ребёнок QA", currentGroup: null }, attendanceRecord: null,
  uploadedBy: { id: "admin", displayName: "Администратор QA", role: "ADMIN" }, reviewedBy: null
};

describe("certificate period review", () => {
  it("reports all finalized days, transfers and the new invoice", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {
      application: { finalizedCount: 2, makeupCount: 2, remainingPendingCount: 0 }, reconciliation: { createdCount: 1, issues: [] }, warning: null
    } }) });
    vi.stubGlobal("fetch", request);
    render(<CertificateReviewControls certificate={certificate} />);
    fireEvent.click(screen.getByRole("button", { name: "Одобрить" }));
    await screen.findByText(/Подтверждено занятий: 2\. Переносов: 2\. Создано счетов: 1\./);
    expect(JSON.parse(request.mock.calls[0][1].body).status).toBe("APPROVED");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers idempotent application of an approved period and shows uncovered illness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {
      application: { finalizedCount: 0, makeupCount: 0, remainingPendingCount: 1 },
      reconciliation: { createdCount: 0, issues: [{ reason: "Проверьте болезнь за 22 октября." }] }, warning: null
    } }) }));
    render(<CertificateReviewControls certificate={{ ...certificate, status: "APPROVED" }} />);
    expect(screen.queryByRole("button", { name: "Отклонить" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Применить к занятиям" }));
    await screen.findByText(/Период проверен.*Остались неразобранные болезни: 1.*Проверьте болезнь за 22 октября/);
  });

  it("shows a committed medical decision with a billing warning without inventing a created bill", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {
      application: { finalizedCount: 2, makeupCount: 2, remainingPendingCount: 0 }, reconciliation: null,
      warning: "Решение сохранено. Сверка не завершена."
    } }) }));
    render(<CertificateReviewControls certificate={certificate} />);
    fireEvent.click(screen.getByRole("button", { name: "Одобрить" }));
    await waitFor(() => expect(screen.getByText(/Решение сохранено\. Сверка не завершена\./)).toBeTruthy());
    expect(screen.queryByText(/Создано счетов:/)).toBeNull();
  });
});
