#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const [mode, templateId] = process.argv.slice(2);
if (!["--check", "--apply"].includes(mode) || !/^[0-9a-f-]{36}$/i.test(templateId ?? "")) {
  throw new Error("Usage: node scripts/configure-fdoc-contract.mjs --check|--apply TEMPLATE_ID");
}
const envPath = fs.realpathSync("/var/www/azbuka-dvizheniya/.env");
process.loadEnvFile(envPath);
if (process.env.FDOC_BASE_URL !== "https://fdoc.ru" || process.env.FDOC_ENVIRONMENT !== "PRODUCTION") {
  throw new Error("Нужен настроенный рабочий F.Doc.");
}
if (process.env.FDOC_PUBLIC_BOOKING_ENABLED !== "false") {
  throw new Error("Смена договора разрешена при закрытой публичной записи.");
}
const base = "https://fdoc.ru/paperless-gateway/api/v1";
async function request(endpoint, token, body) {
  const response = await fetch(base + endpoint, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`F.Doc: ${endpoint.split("?")[0]}, HTTP ${response.status}. Настройки не изменены.`);
  return response.json();
}
const auth = await request("/operator/accessToken", null, {
  apiKey: process.env.FDOC_API_KEY, corpId: process.env.FDOC_CORP_ID, app: process.env.FDOC_APP_CODE,
  grantType: "password",
  grant: Buffer.from(`${process.env.FDOC_EMPLOYEE_LOGIN}:${process.env.FDOC_EMPLOYEE_PASSWORD}`).toString("base64")
});
if (!auth.accessToken) throw new Error("F.Doc не выдал токен.");
const token = auth.accessToken.replace(/^Bearer\s+/i, "");
const contract = await request(`/template?templateExternalId=${encodeURIComponent(templateId)}`, token);
const known = {
  parentName: "PARENT_NAME", parentPhone: "PARENT_PHONE", childName: "CHILD_NAME",
  childBirth: "CHILD_BIRTH", groupName: "GROUP_NAME", weeklySchedule: "WEEKLY_SCHEDULE", lessonPrice: "LESSON_PRICE"
};
const parentFields = ["passportSeries", "passportNumber", "passIssueDate", "passIssuer", "passDeptCode", "registrationAddr"];
if (contract.templateExternalId !== templateId || contract.templateStatus !== "ACTIVE") throw new Error("Договор не активен в F.Doc.");
const params = contract.templateParams ?? [];
const expectedCodes = [...Object.keys(known), ...parentFields];
if (params.length !== expectedCodes.length || params.some((item) => !expectedCodes.includes(item.code))) {
  throw new Error("Набор полей договора отличается от согласованного. Настройки не изменены.");
}
const fieldId = (code) => {
  const found = params.filter((item) => item.code === code);
  if (found.length !== 1 || !Number.isSafeInteger(found[0].id) || found[0].id <= 0 || !found[0].required) {
    throw new Error(`Не найдено обязательное поле договора: ${code}.`);
  }
  return found[0].id;
};
const values = { FDOC_CONTRACT_TEMPLATE_ID: templateId, FDOC_CONTRACT_DYNAMIC_TERMS: "true" };
for (const [code, setting] of Object.entries(known)) values[`FDOC_CONTRACT_${setting}_PARAM_ID`] = String(fieldId(code));
values.FDOC_CONTRACT_PARENT_FILL_PARAM_IDS = parentFields.map(fieldId).join(",");
if (new Set(expectedCodes.map(fieldId)).size !== expectedCodes.length) throw new Error("ID полей договора повторяются.");

const consent = await request(`/template?templateExternalId=${encodeURIComponent(process.env.FDOC_CONSENT_TEMPLATE_ID ?? "")}`, token);
if (consent.templateStatus !== "ACTIVE") throw new Error("Согласие не активно в F.Doc.");
for (const [code, key] of [["parentName", "FDOC_CONSENT_PARENT_NAME_PARAM_ID"], ["parentPhone", "FDOC_CONSENT_PARENT_PHONE_PARAM_ID"]]) {
  if (!consent.templateParams?.some((item) => item.code === code && item.id === Number(process.env[key]))) {
    throw new Error(`Поле согласия ${code} не соответствует настройкам приложения.`);
  }
}
if (consent.templateParams?.some((item) => item.required && !["parentName", "parentPhone"].includes(item.code))) {
  throw new Error("В согласии есть дополнительные обязательные поля. Нужна отдельная настройка заполнения.");
}
console.log(JSON.stringify({ templateId, name: contract.documentName, autofillFields: Object.keys(known).length, parentFields: parentFields.length, consentChecked: true }));
if (mode === "--apply") {
  const client = fs.readFileSync("/var/www/azbuka-dvizheniya/src/server/trials/fdoc-client.ts", "utf8");
  if (!client.includes("templateFillers") || !client.includes("FDOC_CONTRACT_DYNAMIC_TERMS")) {
    throw new Error("Сначала разверните версию приложения с заполнением паспортных полей родителем.");
  }
  const original = fs.readFileSync(envPath, "utf8");
  const originalStat = fs.statSync(envPath);
  const backupDir = "/var/backups/azbuka-dvizheniya";
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const suffix = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const backupPath = path.join(backupDir, `env-before-fdoc-contract-${suffix}`);
  fs.copyFileSync(envPath, backupPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backupPath, 0o600);
  const lines = original.split(/\r?\n/).filter((line) => !Object.hasOwn(values, line.split("=", 1)[0])).filter((line, index, all) => index < all.length - 1 || line);
  lines.push(...Object.entries(values).map(([key, value]) => `${key}=${value}`));
  const temporary = `${envPath}.fdoc-${suffix}`;
  fs.writeFileSync(temporary, lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
  fs.chownSync(temporary, originalStat.uid, originalStat.gid);
  fs.chmodSync(temporary, originalStat.mode & 0o777);
  fs.renameSync(temporary, envPath);
  console.log(JSON.stringify({ configured: true, backupPath, restartRequired: true, publicBooking: false }));
}
