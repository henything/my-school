import { beforeEach, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/server/auth/current-user";
const mocks = vi.hoisted(() => ({ parent: vi.fn(), account: vi.fn(), file: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ parent: { findFirstOrThrow: mocks.parent }, parentAccount: { findFirst: mocks.account }, parentBenefitEvidence: { findFirstOrThrow: mocks.file } }) }));
import { loadBenefitEvidence, MAX_BENEFIT_FILE_BYTES, readBenefitEvidence } from "./benefit-evidence";
const user = { id: "owner", schoolId: "school", role: "PARENT", login: "owner", displayName: "Owner" } as CurrentUser;
beforeEach(() => { vi.resetAllMocks(); mocks.parent.mockResolvedValue({ benefitEvidenceId: "proof" }); mocks.account.mockResolvedValue({ id: "account" }); mocks.file.mockResolvedValue({ id: "proof" }); });

it("accepts a PDF and sanitizes its filename", async () => {
  const result = await readBenefitEvidence(new File(["%PDF-1.7\nproof"], "../../proof.pdf", { type: "application/pdf" }));
  expect(result.originalFileName).toBe("proof.pdf"); expect(result.mimeType).toBe("application/pdf");
});
it.each([
  ["image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
  ["image/jpeg", new Uint8Array([255, 216, 255, 224])],
  ["image/webp", new TextEncoder().encode("RIFF0000WEBP")]
])("recognizes supported %s content", async (type, bytes) => {
  expect((await readBenefitEvidence(new File([bytes], "proof", { type }))).mimeType).toBe(type);
});
it("rejects an executable or HTML disguised as a PDF", async () => {
  await expect(readBenefitEvidence(new File(["<html>not a certificate</html>"], "proof.pdf", { type: "application/pdf" }))).rejects.toThrow("содержимым");
});
it("rejects empty or oversized files before storing data", async () => {
  await expect(readBenefitEvidence(new File([], "proof.pdf", { type: "application/pdf" }))).rejects.toThrow("5 МБ");
  await expect(readBenefitEvidence(new File([new Uint8Array(MAX_BENEFIT_FILE_BYTES + 1)], "proof.pdf", { type: "application/pdf" }))).rejects.toThrow("5 МБ");
});
it("checks the active owner account before reading file bytes", async () => {
  mocks.account.mockResolvedValue(null);
  await expect(loadBenefitEvidence(user, "someone-else")).rejects.toThrow("прав");
  expect(mocks.file).not.toHaveBeenCalled();
});
it("does not let the coach read evidence", async () => {
  await expect(loadBenefitEvidence({ ...user, role: "COACH" }, "parent")).rejects.toThrow("прав");
  expect(mocks.parent).not.toHaveBeenCalled();
});
it.each(["ADMIN", "SUPER_ADMIN", "PARENT"] as const)("scopes every %s file lookup to the school and parent", async role => {
  await loadBenefitEvidence({ ...user, role }, "parent");
  expect(mocks.parent).toHaveBeenCalledWith({ where: { id: "parent", schoolId: "school", archivedAt: null }, select: { benefitEvidenceId: true } });
  expect(mocks.file).toHaveBeenCalledWith({ where: { id: "proof", parentId: "parent", schoolId: "school" } });
});
