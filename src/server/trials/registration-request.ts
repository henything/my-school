/** Keep existing JSON callers working; an evidence upload uses multipart form data. */
export async function readRegistrationRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return { input: await request.json(), file: undefined };
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024) throw new Error("Документ должен быть не больше 5 МБ.");
  const form = await request.formData();
  const payload = form.get("payload");
  if (typeof payload !== "string" || payload.length > 10_000) throw new Error("Не удалось прочитать данные записи.");
  const attachment = form.get("benefitFile");
  if (attachment !== null && !(attachment instanceof File)) throw new Error("Прикрепите файл документа.");
  return { input: JSON.parse(payload) as unknown, file: attachment instanceof File ? attachment : undefined };
}
