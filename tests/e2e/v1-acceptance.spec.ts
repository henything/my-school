import "dotenv/config";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SUPER_ADMIN_LOGIN = process.env.SEED_SUPER_ADMIN_LOGIN ?? "superadmin";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";
const E2E_PASSWORD = "ChangeMe-E2E-01!";

const coachForbiddenFields = new Set([
  "cachedLessonBalance",
  "cachedMakeupBalance",
  "cached_lesson_balance",
  "cached_makeup_balance",
  "lessonPriceKopeks",
  "totalAmountKopeks",
  "paymentStatus",
  "paymentStatusChangedAt",
  "paymentStatusComment",
  "subscriptions",
  "transactions"
]);

type Entity = {
  id: string;
  [key: string]: unknown;
};

type UserPayload = { user: Entity & { login: string; role: string } };
type CoachPayload = { coach: Entity & { userId: string; login: string } };
type BranchPayload = { branch: Entity };
type GroupPayload = { group: Entity };
type ParentPayload = { parent: Entity };
type ChildPayload = { child: Entity & { admissionStatus: string } };
type ScheduleTemplatePayload = { scheduleTemplate: Entity };
type GenerateMonthPayload = { result: { createdCount: number; candidatesCount: number } };
type LessonPayload = { lesson: Entity & { status: string } };
type SubscriptionPayload = { subscription: Entity };
type AdmissionJobPayload = { result: { checkedCount: number; updatedCount: number; createdTaskCount: number } };
type BalancePayload = {
  balance: {
    admissionStatus: string;
    cachedLessonBalance: number;
    cachedMakeupBalance: number;
    transactions: Array<{ lessonId: string | null; type: string; amount: number; attendanceRecordId: string | null }>;
  };
};
type CoachLessonPayload = {
  lesson: Entity & {
    children: Array<{
      id: string;
      fullName: string;
      admissionStatus: string;
      attendance: { id: string | null; status: string; finalStatus: string | null };
    }>;
  };
};
type CoachLessonsPayload = { lessons: Entity[] };
type TasksPayload = { tasks: Array<Entity & { type: string; child: Entity | null }> };
type OperationalCenterPayload = {
  operationalCenter: {
    counts: { notAdmittedChildren: number; criticalTasks: number; availableMakeups: number };
    widgets: {
      notAdmittedChildren: Entity[];
      availableMakeups: Entity[];
      pendingCertificates: Entity[];
      trialsToProcess: Entity[];
    };
  };
};
type AuditPayload = { auditLogs: Array<{ action: string; entityId: string | null }> };
type TrialPayload = { trial: Entity & { status: string } };
type FinalizeAttendancePayload = {
  result: {
    makeup: (Entity & { reason: string; status: string }) | null;
  };
};
type VacationPayload = { result: { lessonCount: number; makeupCount: number } };
type GroupEventPayload = { result: { lessonCount: number; childCount: number; makeupCount: number } };

test.describe.configure({ mode: "serial" });

test("v1 core flow: roles, schedule, coach attendance, deductions, debt, NOT_ADMITTED, tasks and audit", async ({ page, browser, playwright }) => {
  const run = runSuffix();
  await loginViaUi(page, SUPER_ADMIN_LOGIN, SUPER_ADMIN_PASSWORD, /\/admin/);
  await expect(page.getByRole("heading", { name: "Пользователи и роли" })).toBeVisible();
  const ownerApi = page.context().request;

  const adminLogin = `admin_${run}`;
  const coachLogin = `coach_${run}`;

  const adminUser = await postJson<UserPayload>(ownerApi, "/api/users", {
    login: adminLogin,
    password: E2E_PASSWORD,
    displayName: `E2E Admin ${run}`,
    role: "ADMIN"
  });
  expect(adminUser.user.role).toBe("ADMIN");

  const coach = await postJson<CoachPayload>(ownerApi, "/api/coaches", {
    login: coachLogin,
    password: E2E_PASSWORD,
    displayName: `E2E Coach ${run}`,
    phone: `+1000${run.slice(-6)}`,
    notes: "v1 acceptance"
  });

  const adminApi = await authenticatedApi(playwright, adminLogin, E2E_PASSWORD);
  const coachContext = await browser.newContext();

  try {
    const branch = await postJson<BranchPayload>(adminApi, "/api/branches", {
      name: `E2E Branch ${run}`,
      address: "Acceptance street",
      inventoryNotes: "mats",
      comment: "v1 acceptance"
    });
    const group = await postJson<GroupPayload>(adminApi, "/api/groups", {
      name: `E2E Group ${run}`,
      branchId: branch.branch.id,
      mainCoachId: coach.coach.id,
      capacityLimit: 12,
      comment: "v1 acceptance"
    });
    const parent = await postJson<ParentPayload>(adminApi, "/api/parents", {
      fullName: `E2E Parent ${run}`,
      phone: `+1999${run.slice(-6)}`,
      comment: "v1 acceptance"
    });
    const child = await postJson<ChildPayload>(adminApi, "/api/children", {
      fullName: `E2E Child ${run}`,
      parentId: parent.parent.id,
      currentGroupId: group.group.id,
      admissionStatus: "ADMITTED"
    });
    expect(child.child.admissionStatus).toBe("ADMITTED");

    await postJson<ScheduleTemplatePayload>(adminApi, "/api/schedule-templates", {
      groupId: group.group.id,
      weekday: 1,
      startTime: "17:00",
      endTime: "17:45"
    });
    const generated = await postJson<GenerateMonthPayload>(
      adminApi,
      "/api/lessons/generate-month",
      { month: nextMonthKey(), groupId: group.group.id },
      200
    );
    expect(generated.result.createdCount).toBeGreaterThan(0);
    expect(generated.result.candidatesCount).toBeGreaterThanOrEqual(generated.result.createdCount);

    const today = dateKey(0);
    const lessonOne = await createLesson(adminApi, group.group.id, coach.coach.id, today, "09:00", "09:45");
    const lessonTwo = await createLesson(adminApi, group.group.id, coach.coach.id, today, "10:00", "10:45");
    const lessonThree = await createLesson(adminApi, group.group.id, coach.coach.id, today, "11:00", "11:45");

    await postJson<SubscriptionPayload>(adminApi, "/api/subscriptions", {
      childId: child.child.id,
      periodStart: today,
      periodEnd: dateKey(14),
      plannedLessonsCount: 1,
      paymentStatus: "NOT_PAID"
    });
    let balance = await getJson<BalancePayload>(adminApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.cachedLessonBalance).toBe(1);
    expect(balance.balance.transactions.filter((transaction) => transaction.lessonId === lessonOne.lesson.id)).toHaveLength(0);

    const coachPage = await coachContext.newPage();
    await loginViaUi(coachPage, coachLogin, E2E_PASSWORD, /\/coach/);
    await expect(coachPage.getByRole("heading", { name: "Кабинет тренера" })).toBeVisible();
    await expect(coachPage.getByText(`E2E Group ${run}`).first()).toBeVisible();
    const coachApi = coachContext.request;

    const coachLessons = await getJson<CoachLessonsPayload>(coachApi, "/api/coach/lessons");
    expect(coachLessons.lessons.map((lesson) => lesson.id)).toEqual(expect.arrayContaining([lessonOne.lesson.id, lessonTwo.lesson.id]));
    expectNoCoachFinancialFields(coachLessons);

    const detailBefore = await getJson<CoachLessonPayload>(coachApi, `/api/coach/lessons/${lessonOne.lesson.id}`);
    expect(detailBefore.lesson.children.map((lessonChild) => lessonChild.id)).toContain(child.child.id);
    expectNoCoachFinancialFields(detailBefore);

    const markedOne = await postJson<CoachLessonPayload>(
      coachApi,
      `/api/coach/lessons/${lessonOne.lesson.id}/attendance`,
      { records: [{ childId: child.child.id, status: "PRESENT", comment: "E2E present #1" }] },
      200
    );
    expect(markedOne.lesson.status).toBe("ATTENDANCE_COMPLETED");
    expectNoCoachFinancialFields(markedOne);
    balance = await getJson<BalancePayload>(adminApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.cachedLessonBalance).toBe(0);
    expect(balance.balance.admissionStatus).toBe("ADMITTED");
    expect(balance.balance.transactions).toEqual(expect.arrayContaining([expect.objectContaining({ lessonId: lessonOne.lesson.id, type: "PRESENT_DEDUCTION", amount: -1 })]));

    await postJson<CoachLessonPayload>(
      coachApi,
      `/api/coach/lessons/${lessonTwo.lesson.id}/attendance`,
      { records: [{ childId: child.child.id, status: "PRESENT", comment: "E2E credit lesson" }] },
      200
    );
    balance = await getJson<BalancePayload>(adminApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.cachedLessonBalance).toBe(-1);
    expect(balance.balance.admissionStatus).toBe("CREDIT_LESSON_USED");
    expect(balance.balance.transactions).toEqual(expect.arrayContaining([expect.objectContaining({ lessonId: lessonTwo.lesson.id, type: "CREDIT_LESSON_USED", amount: -1 })]));

    const admissionJob = await postJson<AdmissionJobPayload>(adminApi, "/api/jobs/admission-status-check", { now: `${today}T23:00:00.000Z` }, 200);
    expect(admissionJob.result.updatedCount).toBeGreaterThanOrEqual(1);
    balance = await getJson<BalancePayload>(adminApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.admissionStatus).toBe("NOT_ADMITTED");

    const blocked = await coachApi.post(`/api/coach/lessons/${lessonThree.lesson.id}/attendance`, {
      data: { records: [{ childId: child.child.id, status: "PRESENT", comment: "must be blocked" }] }
    });
    const blockedBody = await blocked.text();
    expect(blocked.status(), blockedBody).toBe(400);
    expect(blockedBody).toContain("Ребёнок не допущен");
    balance = await getJson<BalancePayload>(adminApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.transactions.filter((transaction) => transaction.lessonId === lessonThree.lesson.id)).toHaveLength(0);

    await expectForbidden(coachApi, "/api/subscriptions");
    await expectForbidden(coachApi, "/api/audit-logs");
    await expectForbidden(coachApi, `/api/children/${child.child.id}/balance`);

    const tasks = await getJson<TasksPayload>(adminApi, "/api/tasks");
    expect(tasks.tasks.map((task) => task.type)).toEqual(expect.arrayContaining(["CHILD_TOOK_CREDIT_LESSON", "CHILD_NOT_ADMITTED"]));

    const operationalCenter = await getJson<OperationalCenterPayload>(adminApi, "/api/admin/operational-center");
    expect(operationalCenter.operationalCenter.counts.notAdmittedChildren).toBeGreaterThanOrEqual(1);
    expect(operationalCenter.operationalCenter.counts.criticalTasks).toBeGreaterThanOrEqual(1);
    expect(operationalCenter.operationalCenter.widgets.notAdmittedChildren.map((item) => item.id)).toContain(child.child.id);

    const audit = await getJson<AuditPayload>(adminApi, "/api/audit-logs?limit=300");
    expect(audit.auditLogs.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "USER_CREATED",
        "COACH_CREATED",
        "LESSONS_GENERATED_FOR_MONTH",
        "ATTENDANCE_RECORD_UPDATED",
        "LESSON_BALANCE_TRANSACTION_CREATED",
        "CHILD_CREDIT_LESSON_USED",
        "CHILD_ADMISSION_STATUS_UPDATED"
      ])
    );

    await page.goto("/admin/operations");
    await expect(page.getByRole("heading", { name: "Операционный центр" })).toBeVisible();
    await page.goto("/admin/readiness");
    await expect(page.getByRole("heading", { name: "Готовность к пилоту" })).toBeVisible();
  } finally {
    await coachContext.close();
    await adminApi.dispose();
  }
});

test("v1 makeups flow: sick pending safety, confirmed sickness, vacation, quarantine and trials", async ({ browser, playwright }) => {
  const run = runSuffix();
  const ownerApi = await authenticatedApi(playwright, SUPER_ADMIN_LOGIN, SUPER_ADMIN_PASSWORD);
  const coachLogin = `coach_${run}`;
  const coach = await postJson<CoachPayload>(ownerApi, "/api/coaches", {
    login: coachLogin,
    password: E2E_PASSWORD,
    displayName: `E2E Makeup Coach ${run}`,
    phone: `+1777${run.slice(-6)}`,
    notes: "v1 makeups acceptance"
  });

  const branch = await postJson<BranchPayload>(ownerApi, "/api/branches", {
    name: `E2E Makeup Branch ${run}`,
    comment: "v1 makeups acceptance"
  });
  const group = await postJson<GroupPayload>(ownerApi, "/api/groups", {
    name: `E2E Makeup Group ${run}`,
    branchId: branch.branch.id,
    mainCoachId: coach.coach.id,
    capacityLimit: 10
  });
  const child = await postJson<ChildPayload>(ownerApi, "/api/children", {
    fullName: `E2E Makeup Child ${run}`,
    currentGroupId: group.group.id,
    admissionStatus: "ADMITTED"
  });

  const today = dateKey(0);
  const tomorrow = dateKey(1);
  const yesterday = dateKey(-1);
  const sickLesson = await createLesson(ownerApi, group.group.id, coach.coach.id, today, "12:00", "12:45");
  await createLesson(ownerApi, group.group.id, coach.coach.id, tomorrow, "13:00", "13:45");
  await createLesson(ownerApi, group.group.id, coach.coach.id, tomorrow, "14:00", "14:45");

  await postJson<SubscriptionPayload>(ownerApi, "/api/subscriptions", {
    childId: child.child.id,
    periodStart: today,
    periodEnd: dateKey(14),
    plannedLessonsCount: 3,
    paymentStatus: "PAID"
  });

  const coachContext = await browser.newContext();

  try {
    const coachPage = await coachContext.newPage();
    await loginViaUi(coachPage, coachLogin, E2E_PASSWORD, /\/coach/);
    const coachApi = coachContext.request;

    const sickPending = await postJson<CoachLessonPayload>(
      coachApi,
      `/api/coach/lessons/${sickLesson.lesson.id}/attendance`,
      { records: [{ childId: child.child.id, status: "ABSENT_SICK_PENDING", comment: "E2E pending certificate" }] },
      200
    );
    const sickAttendance = sickPending.lesson.children.find((lessonChild) => lessonChild.id === child.child.id)?.attendance;
    expect(sickAttendance?.status).toBe("ABSENT_SICK_PENDING");
    let balance = await getJson<BalancePayload>(ownerApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.cachedLessonBalance).toBe(3);
    expect(balance.balance.transactions.filter((transaction) => transaction.attendanceRecordId === sickAttendance?.id && transaction.amount !== 0)).toHaveLength(0);

    const finalized = await postJson<FinalizeAttendancePayload>(
      ownerApi,
      `/api/attendance/${sickAttendance?.id}/finalize`,
      { finalStatus: "ABSENT_SICK_CONFIRMED", comment: "certificate received" },
      200
    );
    expect(finalized.result.makeup).toEqual(expect.objectContaining({ reason: "SICKNESS", status: "AVAILABLE" }));
    balance = await getJson<BalancePayload>(ownerApi, `/api/children/${child.child.id}/balance`);
    expect(balance.balance.cachedMakeupBalance).toBe(1);

    const backdatedVacation = await ownerApi.post(`/api/children/${child.child.id}/vacations`, {
      data: { periodStart: yesterday, periodEnd: yesterday, comment: "backdated must fail" }
    });
    const backdatedBody = await backdatedVacation.text();
    expect(backdatedVacation.status(), backdatedBody).toBe(400);
    expect(backdatedBody).toContain("Отпуск нельзя оформить задним числом");

    const vacation = await postJson<VacationPayload>(
      ownerApi,
      `/api/children/${child.child.id}/vacations`,
      { periodStart: tomorrow, periodEnd: tomorrow, comment: "approved vacation" },
      201
    );
    expect(vacation.result.lessonCount).toBeGreaterThanOrEqual(1);
    expect(vacation.result.makeupCount).toBeGreaterThanOrEqual(1);

    const quarantine = await postJson<GroupEventPayload>(
      ownerApi,
      "/api/group-events",
      { groupId: group.group.id, reason: "QUARANTINE", periodStart: tomorrow, periodEnd: tomorrow, comment: "group quarantine" },
      201
    );
    expect(quarantine.result.lessonCount).toBeGreaterThanOrEqual(1);
    expect(quarantine.result.childCount).toBe(1);
    expect(quarantine.result.makeupCount).toBeGreaterThanOrEqual(1);

    const trial = await postJson<TrialPayload>(
      coachApi,
      `/api/coach/lessons/${sickLesson.lesson.id}/trials`,
      {
        childName: `E2E Trial ${run}`,
        childAge: 6,
        parentName: `E2E Trial Parent ${run}`,
        parentPhone: `+1666${run.slice(-6)}`,
        source: "VK",
        comment: "trial from coach"
      },
      201
    );
    expect(trial.trial.status).toBe("TRIAL_BOOKED");
    const trialUpdate = await postJson<TrialPayload>(
      coachApi,
      `/api/trials/${trial.trial.id}/status`,
      { status: "TRIAL_ATTENDED", comment: "attended trial" },
      200
    );
    expect(trialUpdate.trial.status).toBe("TRIAL_ATTENDED");

    const operationalCenter = await getJson<OperationalCenterPayload>(ownerApi, "/api/admin/operational-center");
    expect(operationalCenter.operationalCenter.counts.availableMakeups).toBeGreaterThanOrEqual(3);
    expect(operationalCenter.operationalCenter.widgets.pendingCertificates.map((record) => record.id)).not.toContain(sickAttendance?.id);
    expect(operationalCenter.operationalCenter.widgets.trialsToProcess.length).toBeGreaterThanOrEqual(1);

    const audit = await getJson<AuditPayload>(ownerApi, "/api/audit-logs?limit=300");
    expect(audit.auditLogs.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["ATTENDANCE_FINALIZED", "MAKEUP_CREATED", "VACATION_APPROVED", "GROUP_EVENT_APPLIED", "TRIAL_CREATED", "TRIAL_STATUS_UPDATED"])
    );

    await coachPage.goto(`/coach/lessons/${sickLesson.lesson.id}`);
    await expect(coachPage.getByRole("heading", { name: `E2E Makeup Group ${run}` })).toBeVisible();
    await expect(coachPage.getByText(`E2E Trial ${run}`)).toBeVisible();
    await expect(coachPage.getByText("Баланс")).not.toBeVisible();
  } finally {
    await coachContext.close();
    await ownerApi.dispose();
  }
});

async function authenticatedApi(playwright: { request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> } }, login: string, password: string) {
  const context = await playwright.request.newContext({ baseURL: BASE_URL });
  const response = await context.post("/api/auth/login", { data: { login, password } });
  const body = await response.text();
  expect(response.status(), body).toBe(200);
  return context;
}

async function loginViaUi(page: Page, login: string, password: string, redirectPattern: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(redirectPattern);
}

async function createLesson(api: APIRequestContext, groupId: string, coachId: string, lessonDate: string, startTime: string, endTime: string) {
  return postJson<LessonPayload>(api, "/api/lessons", { groupId, coachId, lessonDate, startTime, endTime });
}

async function getJson<T>(api: APIRequestContext, path: string, expectedStatus = 200) {
  const response = await api.get(path);
  return parseJson<T>(response, expectedStatus);
}

async function postJson<T>(api: APIRequestContext, path: string, data: Record<string, unknown>, expectedStatus = 201) {
  const response = await api.post(path, { data });
  return parseJson<T>(response, expectedStatus);
}

async function parseJson<T>(response: { status: () => number; text: () => Promise<string> }, expectedStatus: number) {
  const body = await response.text();
  expect(response.status(), body).toBe(expectedStatus);
  return JSON.parse(body) as T;
}

async function expectForbidden(api: APIRequestContext, path: string) {
  const response = await api.get(path);
  const body = await response.text();
  expect(response.status(), body).toBe(403);
}

function expectNoCoachFinancialFields(payload: unknown) {
  const forbiddenPaths = collectForbiddenFieldPaths(payload);
  expect(forbiddenPaths).toEqual([]);
}

function collectForbiddenFieldPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenFieldPaths(item, [...path, String(index)]));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, childValue]) => {
    const nextPath = [...path, key];
    const current = coachForbiddenFields.has(key) ? [nextPath.join(".")] : [];
    return [...current, ...collectForbiddenFieldPaths(childValue, nextPath)];
  });
}

function runSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function dateKey(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextMonthKey() {
  const now = new Date();
  const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return firstOfNextMonth.toISOString().slice(0, 7);
}
