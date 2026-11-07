// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChildArchiveAction } from "./child-archive-action";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => { refresh.mockReset(); HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("explains financial consequences, allows cancelling, and archives without a mandatory reason", async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ child: { status: "ARCHIVED" } }) });
  vi.stubGlobal("fetch", request);
  render(<ChildArchiveAction childId="child" childName="Ребёнок" status="ACTIVE" />);
  fireEvent.click(screen.getByRole("button", { name: "Архивировать Ребёнок" }));
  expect(screen.getByText(/Неоплаченные счета отменятся/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Архивировать Ребёнок" }));
  fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith("/api/admin/cleanup/children/child", expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Архивация администратором" }) }));
});
it("does not offer archive twice and preserves server errors in the confirmation", async () => {
  const { rerender } = render(<ChildArchiveAction childId="child" childName="Ребёнок" status="ARCHIVED" />);
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<ChildArchiveAction childId="child" childName="Ребёнок" status="ACTIVE" />);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Нет доступа" }) }));
  fireEvent.click(screen.getByRole("button", { name: "Архивировать Ребёнок" }));
  fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Нет доступа");
  expect(refresh).not.toHaveBeenCalled();
});
