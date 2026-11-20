import { afterEach, expect, it, vi } from "vitest";
const { requireApiUser, createSubscription, previewSubscription } = vi.hoisted(() => ({ requireApiUser: vi.fn(), createSubscription: vi.fn(), previewSubscription: vi.fn() }));
vi.mock("@/server/auth/api-user", () => ({ requireApiUser }));
vi.mock("@/server/billing/billing-service", () => ({ createSubscription, previewSubscription, listSubscriptions: vi.fn() }));
import { POST } from "./route";
import { POST as PREVIEW } from "./preview/route";
import { PricingConflict } from "@/server/billing/branch-tariff-rules";
const body = { childId: "7a82b2b7-f9a6-4b47-828e-0c77e1bc541d", periodStart: "2026-12-01", periodEnd: "2026-12-31", pricingMode: "BRANCH_TARIFF" };
const request = (input: unknown) => new Request("http://localhost/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
afterEach(() => vi.resetAllMocks());
it.each([POST, PREVIEW])("blocks unauthorized subscription access before service calls", async handler => {
  requireApiUser.mockResolvedValue({ ok: false, error: "Доступ запрещён.", status: 403 });
  expect((await handler(request(body))).status).toBe(403);
  expect(createSubscription).not.toHaveBeenCalled(); expect(previewSubscription).not.toHaveBeenCalled();
});
it("requires review for new requests and returns 409 for an outdated calculation", async () => {
  requireApiUser.mockResolvedValue({ ok: true, user: { id: "admin" } });
  createSubscription.mockRejectedValue(new PricingConflict("Расчёт изменился"));
  expect((await POST(request(body))).status).toBe(409);
  expect(createSubscription).toHaveBeenCalledWith({ id: "admin" }, expect.objectContaining({ pricingMode: "BRANCH_TARIFF" }), true);
});
it("retains explicit legacy manual prices without requiring a token", async () => {
  requireApiUser.mockResolvedValue({ ok: true, user: { id: "admin" } }); createSubscription.mockResolvedValue({ id: "sub" });
  const { pricingMode: _, ...legacy } = body;
  void _;
  expect((await POST(request({ ...legacy, lessonPriceKopeks: 45000 }))).status).toBe(201);
  expect(createSubscription).toHaveBeenCalledWith({ id: "admin" }, expect.objectContaining({ lessonPriceKopeks: 45000 }), false);
});
