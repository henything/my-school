import { requireApiUser } from "@/server/auth/api-user";
import { jsonError } from "@/lib/http";
export async function POST() {
  const user = await requireApiUser(["SUPER_ADMIN", "ADMIN"]);
  if (!user.ok) return jsonError(user.error, user.status);
  return jsonError("Форма устарела. Обновите страницу и используйте «Изменить остаток занятий» с предварительным расчётом.", 409);
}
