import { z } from "zod";

const responseSchema = z.object({
  documentsFromTemplates: z.array(z.object({ templateId: z.string(), documentId: z.string() })).optional()
});

const statusSchema = z.object({ status: z.string() });

type SigningNames = {
  parentName: string;
  parentPhone: string;
  childName: string;
  childBirth?: string;
  groupName?: string;
  weeklySchedule?: string;
  lessonPriceRub?: string;
};

function parentFillParamIds(prefix: "CONTRACT" | "CONSENT") {
  const key = `FDOC_${prefix}_PARENT_FILL_PARAM_IDS`;
  const raw = process.env[key];
  if (!raw) return [];
  const parts = raw.split(",").map((part) => part.trim());
  const ids = parts.map(Number);
  if (parts.some((part) => !/^\d+$/.test(part)) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error(`Неверные ID полей для заполнения родителем: ${key}.`);
  }
  const lockedIds = Object.entries(process.env)
    .filter(([name]) => name.startsWith(`FDOC_${prefix}_`) && name.endsWith("_PARAM_ID"))
    .map(([, value]) => Number(value));
  if (ids.some((id) => lockedIds.includes(id))) throw new Error(`Поля родителя пересекаются с автозаполнением: ${key}.`);
  return ids;
}

function config() {
  if (process.env.FDOC_MVP_ENABLED !== "true") throw new Error("Подписание F.Doc не настроено.");
  const base = process.env.FDOC_BASE_URL ?? "https://demo.fdoc.ru";
  const url = new URL(base);
  const production = process.env.FDOC_ENVIRONMENT === "PRODUCTION";
  if (url.protocol !== "https:" || !url.hostname.endsWith(".fdoc.ru") && url.hostname !== "fdoc.ru") {
    throw new Error("Недопустимый адрес F.Doc.");
  }
  if (production) {
    if (url.hostname === "demo.fdoc.ru" || process.env.FDOC_PROD_ENABLED !== "true" ||
        process.env.APP_BASE_URL !== "https://azbukadvizheniya.ru" || process.env.FDOC_REAL_DOCUMENTS !== "true" ||
        !process.env.FDOC_EMPLOYEE_ID) {
      throw new Error("Рабочий F.Doc не готов к отправке документов.");
    }
  } else if ((process.env.FDOC_ENVIRONMENT ?? "DEMO") !== "DEMO" || url.hostname !== "demo.fdoc.ru" ||
             process.env.APP_BASE_URL !== "https://test.195.133.56.68.sslip.io") {
    throw new Error("Тестовый F.Doc разрешён только в DEMO контуре.");
  }
  const required = [
    "FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_EMPLOYEE_LOGIN", "FDOC_EMPLOYEE_PASSWORD",
    "FDOC_CONTRACT_TEMPLATE_ID", "FDOC_CONSENT_TEMPLATE_ID",
    "FDOC_CONTRACT_PARENT_NAME_PARAM_ID", "FDOC_CONTRACT_PARENT_PHONE_PARAM_ID", "FDOC_CONTRACT_CHILD_NAME_PARAM_ID",
    "FDOC_CONSENT_PARENT_NAME_PARAM_ID", "FDOC_CONSENT_PARENT_PHONE_PARAM_ID"
  ] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);
  const realDocumentFields = ["FDOC_CONTRACT_CHILD_BIRTH_PARAM_ID", "FDOC_CONTRACT_GROUP_NAME_PARAM_ID"] as const;
  const dynamicTermFields = ["FDOC_CONTRACT_WEEKLY_SCHEDULE_PARAM_ID", "FDOC_CONTRACT_LESSON_PRICE_PARAM_ID"] as const;
  if (process.env.FDOC_REAL_DOCUMENTS === "true") {
    for (const key of realDocumentFields) {
      if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);
    }
  }
  if (process.env.FDOC_CONTRACT_DYNAMIC_TERMS === "true") {
    for (const key of dynamicTermFields) {
      if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);
    }
    if (!parentFillParamIds("CONTRACT").length) throw new Error("Не заданы паспортные поля для заполнения родителем в F.Doc.");
  }
  parentFillParamIds("CONTRACT");
  parentFillParamIds("CONSENT");
  for (const key of [...required.filter((item) => item.endsWith("_PARAM_ID")), ...(process.env.FDOC_REAL_DOCUMENTS === "true" ? realDocumentFields : []),
    ...dynamicTermFields.filter((key) => process.env[key])]) {
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
    ["CHILD_NAME", names.childName],
    ["CHILD_BIRTH", names.childBirth],
    ["GROUP_NAME", names.groupName],
    ["WEEKLY_SCHEDULE", names.weeklySchedule],
    ["LESSON_PRICE", names.lessonPriceRub]
  ] as const;
  return fields.flatMap(([field, value]) => {
    const id = Number(process.env[`FDOC_${prefix}_${field}_PARAM_ID`]);
    return value && Number.isSafeInteger(id) && id > 0 ? [{ id, value, isNotEditableByClient: true }] : [];
  });
}

export async function sendFdocPackage(packageId: string, names: SigningNames) {
  const c = config();
  if (process.env.FDOC_CONTRACT_DYNAMIC_TERMS === "true" && (!names.weeklySchedule?.trim() || !names.lessonPriceRub?.trim())) {
    throw new Error("Для договора нужны выбранный график и стоимость занятия.");
  }
  const parentId = `${packageId}-parent`;
  const documentTemplate = (prefix: "CONTRACT" | "CONSENT", id: string) => {
    const fillIds = parentFillParamIds(prefix);
    return {
      id, autoSendToFill: true, templateParams: templateParams(prefix, names),
      ...(fillIds.length ? { templateFillers: [{
        priority: 1, actionType: "CLIENT", externalId: parentId,
        name: names.parentName, phone: names.parentPhone,
        params: fillIds.map((documentTemplateParamId) => ({ documentTemplateParamId }))
      }] } : {})
    };
  };
  const token = await accessToken();
  const response = await fetch(`${c.base}/paperless-gateway/api/v1/document/withSigners`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      documents: [],
      documentTemplates: [
        documentTemplate("CONTRACT", c.contractTemplateId),
        documentTemplate("CONSENT", c.consentTemplateId)
      ],
      package: {
        id: packageId,
        name: `Договор и согласие — ${names.childName}`,
        signers: [
          { id: parentId, name: names.parentName, phone: names.parentPhone, type: "client", priority: 1 },
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
  return { contractDocumentId, consentDocumentId, contractTemplateId: c.contractTemplateId, consentTemplateId: c.consentTemplateId };
}

export async function fdocStatus(id: string, idType: "package" | "document") {
  const c = config();
  const token = await accessToken();
  const url = new URL(`${c.base}/paperless-gateway/portal/api/v1/document/status`);
  url.search = new URLSearchParams({ id, idType, corpId: c.corpId }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
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
