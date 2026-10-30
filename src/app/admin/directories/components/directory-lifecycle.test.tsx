// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DirectoryLifecycle } from "./directory-lifecycle";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  refresh.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const entry = { id: "g", name: "Группа 81", status: "ACTIVE" };
it("requires the exact name before permanent deletion and allows cancellation", async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) });
  vi.stubGlobal("fetch", request);
  render(<DirectoryLifecycle kind="groups" entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Удалить Группа 81" }));
  const submit = screen.getByRole("button", { name: "Удалить" });
  expect(submit.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Другой" } });
  expect(submit.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Удалить Группа 81" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: entry.name } });
  fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(request.mock.calls[0][0]).toBe("/api/groups/g");
  expect(request.mock.calls[0][1].method).toBe("DELETE");
});
it("keeps the dialog open and explains archive blockers", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Сначала переведите детей." }) }));
  render(<DirectoryLifecycle kind="groups" entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Архивировать Группа 81" }));
  fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("переведите детей");
  expect(refresh).not.toHaveBeenCalled();
});
