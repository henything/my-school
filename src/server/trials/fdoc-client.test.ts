import { afterEach, expect, it, vi } from "vitest";
import { sendFdocPackage } from "./fdoc-client";

const keys = [
  "FDOC_MVP_ENABLED", "FDOC_BASE_URL", "FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_EMPLOYEE_LOGIN",
  "FDOC_EMPLOYEE_PASSWORD", "FDOC_EMPLOYEE_ID", "FDOC_APP_CODE", "FDOC_CONTRACT_TEMPLATE_ID", "FDOC_CONSENT_TEMPLATE_ID",
  "FDOC_CONTRACT_PARENT_NAME_PARAM_ID", "FDOC_CONTRACT_PARENT_PHONE_PARAM_ID", "FDOC_CONTRACT_CHILD_NAME_PARAM_ID",
  "FDOC_CONSENT_PARENT_NAME_PARAM_ID", "FDOC_CONSENT_PARENT_PHONE_PARAM_ID"
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

it("sends both templates with known family data and leaves passport for parent", async () => {
  Object.assign(process.env, {
    FDOC_MVP_ENABLED: "true", FDOC_API_KEY: "test-key", FDOC_CORP_ID: "test-corp",
    FDOC_EMPLOYEE_LOGIN: "test-login", FDOC_EMPLOYEE_PASSWORD: "test-password", FDOC_APP_CODE: "532110981120",
    FDOC_CONTRACT_TEMPLATE_ID: "contract-template", FDOC_CONSENT_TEMPLATE_ID: "consent-template",
    FDOC_CONTRACT_PARENT_NAME_PARAM_ID: "11", FDOC_CONTRACT_PARENT_PHONE_PARAM_ID: "12", FDOC_CONTRACT_CHILD_NAME_PARAM_ID: "13",
    FDOC_CONSENT_PARENT_NAME_PARAM_ID: "21", FDOC_CONSENT_PARENT_PHONE_PARAM_ID: "22"
  });
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(requests.length === 1
      ? { accessToken: "test-token" }
      : { documentsFromTemplates: [
          { templateId: "contract-template", documentId: "contract-doc" },
          { templateId: "consent-template", documentId: "consent-doc" }
        ] }), { status: 200 });
  }));

  const ids = await sendFdocPackage("11111111-1111-4111-8111-111111111111", {
    parentName: "Родитель Пример", parentPhone: "+79990000000", childName: "Ребёнок Пример"
  });
  expect(ids).toEqual({ contractDocumentId: "contract-doc", consentDocumentId: "consent-doc" });
  expect(requests).toHaveLength(2);
  expect(requests[0].url).toContain("demo.fdoc.ru");
  expect(requests[0].body).toMatchObject({ grantType: "password", app: "532110981120" });
  const body = requests[1].body;
  expect((body.package as { signers: unknown[] }).signers).toHaveLength(1);
  expect((body.documentTemplates as Array<{ templateParams: Array<{ id: number; value: string }> }>)[0].templateParams)
    .toEqual(expect.arrayContaining([{ id: 11, value: "Родитель Пример", isNotEditableByClient: true }, { id: 13, value: "Ребёнок Пример", isNotEditableByClient: true }]));
  expect(JSON.stringify(body)).not.toContain("passport");
});
