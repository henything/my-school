import "dotenv/config";
import { randomInt } from "node:crypto";
import { getPrisma } from "../src/server/db/prisma";
import { getTestJourney, registerTestJourney, signupTestParent, testBookableLessons } from "../src/server/trials/fdoc-full-cycle-test";

const code = process.env.FDOC_TEST_SIGNUP_CODE;
if (!code) throw new Error("Тестовый код не настроен.");
const lessons = await testBookableLessons();
if (!lessons.length) throw new Error("На стенде нет доступного будущего пробного занятия.");
const password = `Smoke-${randomInt(10_000_000, 99_999_999)}!`;
const phone = `+7999${randomInt(1_000_000, 9_999_999)}`;
const user = await signupTestParent({ accessCode: code, parentPhone: phone, password, passwordConfirm: password });
const currentUser = { id: user.id, schoolId: user.schoolId, login: user.login, displayName: user.displayName, role: user.role };
const application = await registerTestJourney({
  lessonId: lessons[0].id, parentName: "Тест Проверка", parentVkUrl: "",
  childName: "Ребёнок Проверка", childBirthDate: "2021-01-15"
}, currentUser);
const result = await getTestJourney(application.token, currentUser);
if (result.trialStatus !== "TRIAL_BOOKED" || result.childStatus !== "TRIAL" || result.invoice) {
  throw new Error("Стартовые статусы заявки не соответствуют ожидаемым.");
}
console.log("[fdoc] Стенд: регистрация, карточка ребёнка и пробное занятие созданы без счёта.");
await getPrisma().$disconnect();
