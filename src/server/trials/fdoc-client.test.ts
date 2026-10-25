import { afterEach, expect, it, vi } from "vitest";
import { assertFdocConfigured, fdocStatus, sendFdocPackage } from "./fdoc-client";

const keys = [
  "APP_BASE_URL", "FDOC_ENVIRONMENT", "FDOC_PROD_ENABLED",
  "FDOC_MVP_ENABLED", "FDOC_BASE_URL", "FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_EMPLOYEE_LOGIN",
  "FDOC_EMPLOYEE_PASSWORD", "FDOC_EMPLOYEE_ID", "FDOC_APP_CODE", "FDOC_CONTRACT_TEMPLATE_ID", "FDOC_CONSENT_TEMPLATE_ID",
  "FDOC_CONTRACT_PARENT_NAME_PARAM_ID", "FDOC_CONTRACT_PARENT_PHONE_PARAM_ID", "FDOC_CONTRACT_CHILD_NAME_PARAM_ID",
  "FDOC_CONSENT_PARENT_NAME_PARAM_ID", "FDOC_CONSENT_PARENT_PHONE_PARAM_ID",
  "FDOC_REAL_DOCUMENTS", "FDOC_CONTRACT_CHILD_BIRTH_PARAM_ID", "FDOC_CONTRACT_GROUP_NAME_PARAM_ID"
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
    APP_BASE_URL: "https://test.195.133.56.68.sslip.io", FDOC_ENVIRONMENT: "DEMO",
    FDOC_MVP_ENABLED: "true", FDOC_API_KEY: "test-key", FDOC_CORP_ID: "test-corp",
    FDOC_EMPLOYEE_LOGIN: "test-login", FDOC_EMPLOYEE_PASSWORD: "test-password", FDOC_APP_CODE: "532110981120",
    FDOC_CONTRACT_TEMPLATE_ID: "contract-template", FDOC_CONSENT_TEMPLATE_ID: "consent-template",
    FDOC_CONTRACT_PARENT_NAME_PARAM_ID: "11", FDOC_CONTRACT_PARENT_PHONE_PARAM_ID: "12", FDOC_CONTRACT_CHILD_NAME_PARAM_ID: "13",
    FDOC_REAL_DOCUMENTS: "true", FDOC_CONTRACT_CHILD_BIRTH_PARAM_ID: "14", FDOC_CONTRACT_GROUP_NAME_PARAM_ID: "15",
    FDOC_CONSENT_PARENT_NAME_PARAM_ID: "21", FDOC_CONSENT_PARENT_PHONE_PARAM_ID: "22"
  });
  const requests: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown>, authorization: new Headers(init.headers).get("Authorization") ?? undefined });
    return new Response(JSON.stringify(requests.length === 1
      ? { accessToken: "Bearer test-token" }
      : { documentsFromTemplates: [
          { templateId: "contract-template", documentId: "contract-doc" },
          { templateId: "consent-template", documentId: "consent-doc" }
        ] }), { status: 200 });
  }));

  const ids = await sendFdocPackage("11111111-1111-4111-8111-111111111111", {
    parentName: "Родитель Пример", parentPhone: "+79990000000", childName: "Ребёнок Пример",
    childBirth: "01.01.2021", groupName: "Тестовая группа"
  });
  expect(ids).toEqual({ contractDocumentId: "contract-doc", consentDocumentId: "consent-doc", contractTemplateId: "contract-template", consentTemplateId: "consent-template" });
  expect(requests).toHaveLength(2);
  expect(requests[0].url).toContain("demo.fdoc.ru");
  expect(requests[0].body).toMatchObject({ grantType: "password", app: "532110981120" });
  expect(requests[1].authorization).toBe("Bearer test-token");
  const body = requests[1].body;
  expect((body.package as { signers: unknown[] }).signers).toHaveLength(1);
  expect((body.documentTemplates as Array<{ templateParams: Array<{ id: number; value: string }> }>)[0].templateParams)
    .toEqual(expect.arrayContaining([
      { id: 11, value: "Родитель Пример", isNotEditableByClient: true },
      { id: 13, value: "Ребёнок Пример", isNotEditableByClient: true },
      { id: 14, value: "01.01.2021", isNotEditableByClient: true },
      { id: 15, value: "Тестовая группа", isNotEditableByClient: true }
    ]));
  expect(JSON.stringify(body)).not.toContain("passport");
});

it("authenticates status requests to the F.Doc portal", async () => {
  Object.assign(process.env, {
    APP_BASE_URL: "https://test.195.133.56.68.sslip.io", FDOC_ENVIRONMENT: "DEMO",
    FDOC_MVP_ENABLED: "true", FDOC_API_KEY: "test-key", FDOC_CORP_ID: "test-corp",
    FDOC_EMPLOYEE_LOGIN: "test-login", FDOC_EMPLOYEE_PASSWORD: "test-password",
    FDOC_CONTRACT_TEMPLATE_ID: "contract-template", FDOC_CONSENT_TEMPLATE_ID: "consent-template",
    FDOC_CONTRACT_PARENT_NAME_PARAM_ID: "11", FDOC_CONTRACT_PARENT_PHONE_PARAM_ID: "12", FDOC_CONTRACT_CHILD_NAME_PARAM_ID: "13",
    FDOC_CONSENT_PARENT_NAME_PARAM_ID: "21", FDOC_CONSENT_PARENT_PHONE_PARAM_ID: "22"
  });
  const requests: Array<{ url: string; authorization?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit) => {
    requests.push({ url: String(url), authorization: new Headers(init.headers).get("Authorization") ?? undefined });
    return new Response(JSON.stringify(requests.length === 1 ? { accessToken: "Bearer test-token" } : { status: "WAIT_FILL" }), { status: 200 });
  }));
  expect(await fdocStatus("document-1", "document")).toBe("WAIT_FILL");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ authorization: "Bearer test-token" });
  expect(requests[1].url).toContain("id=document-1");
});

it("keeps the production signer off the demo host and requires the organisation signer", () => {
  Object.assign(process.env, {
    APP_BASE_URL: "https://azbukadvizheniya.ru", FDOC_ENVIRONMENT: "PRODUCTION", FDOC_PROD_ENABLED: "true",
    FDOC_MVP_ENABLED: "true", FDOC_BASE_URL: "https://demo.fdoc.ru", FDOC_REAL_DOCUMENTS: "true"
  });
  expect(() => assertFdocConfigured()).toThrow("Рабочий F.Doc не готов");
  process.env.FDOC_BASE_URL = "https://paperless.fdoc.ru";
  expect(() => assertFdocConfigured()).toThrow("Рабочий F.Doc не готов");
});
