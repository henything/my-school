import { z } from "zod";

const responseSchema = z.object({
  documentsFromTemplates: z.array(z.object({ templateId: z.string(), documentId: z.string() })).optional()
});

const statusSchema = z.object({ status: z.string() });

type SigningNames = { parentName: string; parentPhone: string; childName: string };

function config() {
  if (process.env.FDOC_MVP_ENABLED !== "true") throw new Error("Подписание F.Doc не настроено.");
  const base = process.env.FDOC_BASE_URL ?? "https://demo.fdoc.ru";
  if (new URL(base).hostname !== "demo.fdoc.ru") throw new Error("MVP разрешён только в тестовом контуре F.Doc.");
  const required = [
    "FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_EMPLOYEE_LOGIN", "FDOC_EMPLOYEE_PASSWORD",
    "FDOC_CONTRACT_TEMPLATE_ID", "FDOC_CONSENT_TEMPLATE_ID",
    "FDOC_CONTRACT_PARENT_NAME_PARAM_ID", "FDOC_CONTRACT_PARENT_PHONE_PARAM_ID", "FDOC_CONTRACT_CHILD_NAME_PARAM_ID",
    "FDOC_CONSENT_PARENT_NAME_PARAM_ID", "FDOC_CONSENT_PARENT_PHONE_PARAM_ID"
  ] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);
  for (const key of required.filter((item) => item.endsWith("_PARAM_ID"))) {
    if (!Number.isSafeInteger(Number(process.env[key])) || Number(process.env[key]) <= 0) throw new Error(`Неверный ID параметра ${key}.`);
  }
  return {
    base,
    apiKey: process.env.FDOC_API_KEY!,
    corpId: process.env.FDOC_CORP_ID!,
    login: process.env.FDOC_EMPLOYEE_LOGIN!,
    password: process.env.FDOC_EMPLOYEE_PASSWORD!,
    employeeId: process.env.FDOC_EMPLOYEE_ID,
    app: process.env.FDOC_APP_CODE ?? "532110981120",
    contractTemplateId: process.env.FDOC_CONTRACT_TEMPLATE_ID!,
    consentTemplateId: process.env.FDOC_CONSENT_TEMPLATE_ID!
  };
}

export function assertFdocConfigured() {
  config();
}

async function accessToken() {
  const c = config();
  const response = await fetch(`${c.base}/paperless-gateway/api/v1/operator/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: c.apiKey, corpId: c.corpId, app: c.app, grantType: "password",
      grant: Buffer.from(`${c.login}:${c.password}`).toString("base64")
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`F.Doc: ошибка авторизации (${response.status}).`);
  const payload = z.object({ accessToken: z.string().min(1) }).parse(await response.json());
  return payload.accessToken.replace(/^Bearer\s+/i, "");
}

function templateParams(prefix: "CONTRACT" | "CONSENT", names: SigningNames) {
  const fields = [
    ["PARENT_NAME", names.parentName],
    ["PARENT_PHONE", names.parentPhone],
    ["CHILD_NAME", names.childName]
  ] as const;
  return fields.flatMap(([field, value]) => {
    const id = Number(process.env[`FDOC_${prefix}_${field}_PARAM_ID`]);
    return Number.isSafeInteger(id) && id > 0 ? [{ id, value, isNotEditableByClient: true }] : [];
  });
}

export async function sendFdocPackage(packageId: string, names: SigningNames) {
  const c = config();
  const token = await accessToken();
  const response = await fetch(`${c.base}/paperless-gateway/api/v1/document/withSigners`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      documents: [],
      documentTemplates: [
        { id: c.contractTemplateId, autoSendToFill: true, templateParams: templateParams("CONTRACT", names) },
        { id: c.consentTemplateId, autoSendToFill: true, templateParams: templateParams("CONSENT", names) }
      ],
      package: {
        id: packageId,
        name: `Договор и согласие — ${names.childName}`,
        signers: [
          { id: `${packageId}-parent`, name: names.parentName, phone: names.parentPhone, type: "client", priority: 1 },
          ...(c.employeeId ? [{ id: c.employeeId, type: "corp", priority: 2, operatorAutoSign: true }] : [])
        ]
      }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`F.Doc: отправка не выполнена (${response.status}).`);
  const payload = responseSchema.parse(await response.json());
  const ids = payload.documentsFromTemplates ?? [];
  const contractDocumentId = ids.find((item) => item.templateId === c.contractTemplateId)?.documentId;
  const consentDocumentId = ids.find((item) => item.templateId === c.consentTemplateId)?.documentId;
  if (!contractDocumentId || !consentDocumentId) throw new Error("F.Doc не вернул номера обоих документов.");
  return { contractDocumentId, consentDocumentId };
}

export async function fdocStatus(id: string, idType: "package" | "document") {
  const c = config();
  const url = new URL(`${c.base}/paperless-gateway/portal/api/v1/document/status`);
  url.search = new URLSearchParams({ id, idType, corpId: c.corpId }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`F.Doc: не удалось получить статус (${response.status}).`);
  return statusSchema.parse(await response.json()).status;
}

export async function fdocSignedPdf(packageId: string, documentId: string) {
  const c = config();
  const token = await accessToken();
  const url = new URL(`${c.base}/paperless-gateway/portal/api/v1/document`);
  url.search = new URLSearchParams({ packageGuid: packageId, documentGuid: documentId, download: "true" }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`F.Doc: не удалось скачать документ (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("F.Doc вернул файл не в формате PDF.");
  return bytes;
}
