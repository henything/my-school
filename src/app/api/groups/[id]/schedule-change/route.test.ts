import { afterEach, describe, expect, it, vi } from "vitest";
const { requireApiUser, changeGroupSchedule } = vi.hoisted(() => ({ requireApiUser: vi.fn(), changeGroupSchedule: vi.fn() }));
vi.mock("@/server/auth/api-user", () => ({ requireApiUser }));
vi.mock("@/server/schedule/change-service", () => ({ changeGroupSchedule }));
import { POST } from "./route";
const id = "7a82b2b7-f9a6-4b47-828e-0c77e1bc541d";
const input = { effectiveFrom: "2026-11-01", slots: [{ weekday: 2, startTime: "10:00", endTime: "11:00" }], reason: "Новый график" };
const request = (body: unknown) => new Request(`http://localhost/api/groups/${id}/schedule-change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id }) };
afterEach(() => vi.resetAllMocks());
describe("schedule change API boundary", () => {
  it("rejects an unauthorized request before reading or changing schedule data", async () => {
    requireApiUser.mockResolvedValue({ ok: false, error: "Доступ запрещён.", status: 403 });
    const response = await POST(request(input), context);
    expect(response.status).toBe(403);
    expect(requireApiUser).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"]);
    expect(changeGroupSchedule).not.toHaveBeenCalled();
  });
  it("rejects body/path group mismatch before service access", async () => {
    requireApiUser.mockResolvedValue({ ok: true, user: { id: "admin" } });
    const response = await POST(request({ ...input, groupId: "7a82b2b7-f9a6-4b47-828e-0c77e1bc541e" }), context);
    expect(response.status).toBe(400);
    expect(changeGroupSchedule).not.toHaveBeenCalled();
  });
  it("forces path group and passes validated preview to service", async () => {
    const user = { id: "admin", schoolId: "school" };
    requireApiUser.mockResolvedValue({ ok: true, user });
    changeGroupSchedule.mockResolvedValue({ fingerprint: "a".repeat(64) });
    const response = await POST(request(input), context);
    expect(response.status).toBe(200);
    expect(changeGroupSchedule).toHaveBeenCalledWith(user, { ...input, groupId: id, action: "preview", plans: [], acknowledgeManualTasks: false });
  });
  it("returns conflict for stale previews so client must review again", async () => {
    requireApiUser.mockResolvedValue({ ok: true, user: { id: "admin" } });
    changeGroupSchedule.mockRejectedValue(new Error("Расписание изменилось. Получите новый предварительный расчёт."));
    const response = await POST(request({ ...input, action: "apply", fingerprint: "a".repeat(64) }), context);
    expect(response.status).toBe(409);
  });
});
