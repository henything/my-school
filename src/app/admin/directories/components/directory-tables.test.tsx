// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectoryTables } from "./directory-tables";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const group = {
  id: "group-1",
  name: "Группа 81",
  address: "Адрес филиала",
  addressOverride: null,
  status: "ACTIVE",
  capacityLimit: 15,
  activeChildrenCount: 0,
  isOverCapacity: false,
  branch: { name: "Филиал 81", address: "Адрес филиала" },
  mainCoach: { id: "coach-1", displayName: "Тренер" }
};

describe("group address editing", () => {
  it("asks for confirmation before changing one group address", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ group: { id: group.id } }) });
    vi.stubGlobal("fetch", request);
    render(<DirectoryTables groups={[group]} coaches={[]} childRows={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить адрес группы Группа 81" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Адрес группы Группа 81" }), { target: { value: "Новый адрес" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Подтвердить изменение адреса группы" }).textContent).toContain("Адрес филиала");
    expect(screen.getByRole("dialog").textContent).toContain("Новый адрес");

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }));
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    fireEvent.click(screen.getByRole("button", { name: "Да" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/groups/group-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "Новый адрес" })
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("can clear the group address and return to the branch address", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ group: { id: group.id } }) });
    vi.stubGlobal("fetch", request);
    render(<DirectoryTables groups={[{ ...group, address: "Отдельный адрес", addressOverride: "Отдельный адрес" }]} coaches={[]} childRows={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить адрес группы Группа 81" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Адрес группы Группа 81" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByRole("dialog").textContent).toContain("Адрес филиала");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Да" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/groups/group-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: null })
    }));
  });
});
