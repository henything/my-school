import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

const keys = ["FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_EMPLOYEE_LOGIN", "FDOC_EMPLOYEE_PASSWORD"] as const;
for (const key of keys) if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);

const base = "https://demo.fdoc.ru/paperless-gateway/api/v1";
const auth = await fetch(`${base}/operator/accessToken`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: process.env.FDOC_API_KEY,
    corpId: process.env.FDOC_CORP_ID,
    app: process.env.FDOC_APP_CODE ?? "532110981120",
    grantType: "password",
    grant: Buffer.from(`${process.env.FDOC_EMPLOYEE_LOGIN}:${process.env.FDOC_EMPLOYEE_PASSWORD}`).toString("base64")
  }),
  signal: AbortSignal.timeout(15_000)
});
if (!auth.ok) throw new Error(`F.Doc: ошибка входа (${auth.status}).`);
const { accessToken } = await auth.json() as { accessToken: string };
if (!accessToken) throw new Error("F.Doc не вернул токен сотрудника.");

const fields = {
  parentName: "Родитель",
  parentPhone: "Телефон родителя",
  childName: "Ребёнок",
  childBirth: "Дата рождения ребёнка",
  passportNumber: "Паспорт",
  passportDate: "Дата выдачи паспорта",
  passportIssuer: "Кем выдан паспорт",
  passportCode: "Код подразделения",
  parentAddress: "Адрес регистрации"
} as const;

const directory = process.env.FDOC_TEST_TEMPLATE_DIR ?? path.join(process.cwd(), ".local", "fdoc-templates");
const specs = [
  { name: "Азбука MVP ТЕСТ договор", file: "fdoc-mvp-contract-test.docx", codes: Object.keys(fields) },
  { name: "Азбука MVP ТЕСТ согласие", file: "fdoc-mvp-consent-test.docx", codes: Object.keys(fields).filter((code) => !["childName", "childBirth"].includes(code)) }
];

const list = await fetch(`${base}/corp/templates`, {
  headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(15_000)
});
if (!list.ok) throw new Error(`F.Doc: ошибка списка шаблонов (${list.status}).`);
const existing = await list.json() as Array<{ templateExternalId: string; documentName: string; templateStatus: string }>;

for (const spec of specs) {
  let templateId = existing.find((item) => item.documentName === spec.name && item.templateStatus !== "DELETED")?.templateExternalId;
  if (!templateId) {
    const file = await readFile(path.join(directory, spec.file));
    const response = await fetch(`${base}/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        template: { documentName: spec.name, templateFile: file.toString("base64") },
        templateParams: spec.codes.map((code) => ({
          code, name: fields[code as keyof typeof fields],
          type: code === "passportDate" || code === "childBirth" ? "DATE" : code === "passportIssuer" || code === "parentAddress" ? "TEXTAREA" : "INPUT",
          required: true
        }))
      }),
      signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) throw new Error(`F.Doc: не удалось создать тестовый шаблон «${spec.name}» (${response.status}).`);
    templateId = (await response.json() as { templateExternalId: string }).templateExternalId;
  }
  if (!templateId) throw new Error(`F.Doc не вернул ID шаблона «${spec.name}».`);
  const url = new URL(`${base}/template`);
  url.searchParams.set("templateExternalId", templateId);
  const detail = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!detail.ok) throw new Error(`F.Doc: не удалось прочитать поля шаблона (${detail.status}).`);
  const data = await detail.json() as { templateParams?: Array<{ id: number; code: string; name: string }> };
  console.log(JSON.stringify({ template: spec.name, id: templateId, params: (data.templateParams ?? []).map(({ id, code, name }) => ({ id, code, name })) }, null, 2));
}
