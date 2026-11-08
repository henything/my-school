// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AttendanceForm } from "./attendance-form";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const child = { id: "child", fullName: "Ребёнок", age: 5, medicalNotes: null, coachComment: null, adminComment: null, admissionStatus: "ADMITTED", parent: null, attendance: { status: "NOT_MARKED" as const, comment: null } };
const preview = { revision: "a".repeat(64), changes: [], childrenWithoutSubscription: [] };
const response = (ok: boolean, body: unknown) => ({ ok, json: async () => body });
beforeEach(() => { refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup() {
  render(<AttendanceForm lessonId="lesson" lessonChildren={[child]} adminMode />);
  fireEvent.click(screen.getByRole("button", { name: /^Карантин$/ }));
  fireEvent.change(screen.getByPlaceholderText("Например, уточнили посещение у тренера"), { target: { value: "Уточнили карантин" } });
}
it("distinguishes the preview from a saved roster and sends the reviewed revision", async () => {
  const request = vi.fn().mockResolvedValueOnce(response(true, { preview })).mockResolvedValueOnce(response(true, { financialChanges: 0 }));
  vi.stubGlobal("fetch", request); setup();
  fireEvent.click(screen.getByRole("button", { name: "Проверить исправление" }));
  expect((await screen.findByRole("status")).textContent).toContain("Отметки ещё не сохранены");
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Сохранить табель" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  const options = request.mock.calls[1][1];
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toMatchObject({ expectedRevision: preview.revision, correctionReason: "Уточнили карантин", records: [{ childId: "child", status: "ABSENT_QUARANTINE" }] });
});
it("focuses a server rejection and requires a new preview instead of claiming success", async () => {
  const request = vi.fn().mockResolvedValueOnce(response(true, { preview })).mockResolvedValueOnce(response(false, { error: "Табель или счёт изменился" }));
  vi.stubGlobal("fetch", request); setup();
  fireEvent.click(screen.getByRole("button", { name: "Проверить исправление" }));
  fireEvent.click(await screen.findByRole("button", { name: "Сохранить табель" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Табель или счёт изменился");
  await waitFor(() => expect(document.activeElement).toBe(alert));
  expect(screen.getByRole("button", { name: "Проверить исправление" }).hasAttribute("disabled")).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});
it("recovers the save button and shows uncertainty after a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))); setup();
  fireEvent.click(screen.getByRole("button", { name: "Проверить исправление" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Не удалось подтвердить сохранение");
  expect(screen.getByRole("button", { name: "Проверить исправление" }).hasAttribute("disabled")).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});
