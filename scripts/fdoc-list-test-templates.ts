import "dotenv/config";

const keys = ["FDOC_API_KEY", "FDOC_CORP_ID", "FDOC_TECH_LOGIN", "FDOC_TECH_PASSWORD", "FDOC_EMPLOYEE_ID"] as const;
for (const key of keys) if (!process.env[key]) throw new Error(`Не задана настройка ${key}.`);

const base = "https://demo.fdoc.ru/paperless-gateway/api/v1";
const auth = await fetch(`${base}/operator/accessToken`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    apiKey: process.env.FDOC_API_KEY,
    corpId: process.env.FDOC_CORP_ID,
    app: process.env.FDOC_APP_CODE ?? "API",
    grantType: "techAccount",
    grant: Buffer.from(`${process.env.FDOC_TECH_LOGIN}:${process.env.FDOC_TECH_PASSWORD}`).toString("base64"),
    employeeInitiator: { id: process.env.FDOC_EMPLOYEE_ID }
  }),
  signal: AbortSignal.timeout(15_000)
});
if (!auth.ok) throw new Error(`F.Doc: ошибка входа (${auth.status}).`);
const { accessToken } = await auth.json() as { accessToken: string };
if (!accessToken) throw new Error("F.Doc не вернул токен сотрудника.");

const list = await fetch(`${base}/corp/templates`, {
  headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(15_000)
});
if (!list.ok) throw new Error(`F.Doc: ошибка списка шаблонов (${list.status}).`);
const templates = await list.json() as Array<{ templateExternalId: string; documentName: string; templateStatus: string }>;
for (const template of templates) {
  const url = new URL(`${base}/template`);
  url.searchParams.set("templateExternalId", template.templateExternalId);
  const detail = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000)
  });
  if (!detail.ok) throw new Error(`F.Doc: ошибка шаблона ${template.templateExternalId} (${detail.status}).`);
  const data = await detail.json() as { templateParams?: Array<{ id: number; code: string; name: string; required: boolean }> };
  console.log(JSON.stringify({
    id: template.templateExternalId,
    name: template.documentName,
    status: template.templateStatus,
    parameters: (data.templateParams ?? []).map((parameter) => ({ id: parameter.id, code: parameter.code, name: parameter.name, required: parameter.required }))
  }, null, 2));
}
