import { expect, it } from "vitest";
import { readRegistrationRequest } from "./registration-request";

it("accepts existing JSON registrations without evidence", async () => {
  const request = new Request("http://localhost/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ childName: "Child" }) });
  expect(await readRegistrationRequest(request)).toEqual({ input: { childName: "Child" }, file: undefined });
});
it("accepts multipart details together with evidence", async () => {
  const form = new FormData(); form.set("payload", JSON.stringify({ benefitCategory: "LARGE_FAMILY" })); form.set("benefitFile", new File(["%PDF-1.7"], "proof.pdf", { type: "application/pdf" }));
  const result = await readRegistrationRequest(new Request("http://localhost/register", { method: "POST", body: form }));
  expect(result.input).toEqual({ benefitCategory: "LARGE_FAMILY" }); expect(result.file?.name).toBe("proof.pdf");
});
it("rejects a string disguised as an attachment", async () => {
  const form = new FormData(); form.set("payload", "{}"); form.set("benefitFile", "/etc/passwd");
  await expect(readRegistrationRequest(new Request("http://localhost/register", { method: "POST", body: form }))).rejects.toThrow("файл");
});
