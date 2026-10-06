import "dotenv/config";
import { expect, test } from "@playwright/test";

test("child transfer controls stay visible and submit the selected group", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(process.env.SEED_SUPER_ADMIN_LOGIN ?? "superadmin");
  await page.getByLabel("Пароль").fill(process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/admin/directories");
  await page.getByRole("heading", { name: "Дети", exact: true }).scrollIntoViewIfNeeded();
  const transferButton = page.getByRole("button", { name: "Перевести" }).first();
  await expect(transferButton).toBeInViewport();
  await transferButton.click();

  const dialog = page.getByRole("dialog", { name: "Перевести ребёнка" });
  await expect(dialog).toBeVisible();
  const confirmButton = dialog.getByRole("button", { name: "Подтвердить перевод" });
  await expect(confirmButton).toBeInViewport();
  await expect(confirmButton).toBeDisabled();

  await dialog.getByRole("combobox", { name: "Новая группа" }).click();
  await dialog.locator('[role="option"][aria-selected="false"]').nth(1).click();
  await expect(confirmButton).toBeEnabled();

  let submittedGroupId: string | null = null;
  await page.route("**/api/children/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    submittedGroupId = (route.request().postDataJSON() as { currentGroupId: string }).currentGroupId;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"child":{}}' });
  });

  await confirmButton.click();
  await expect(dialog).not.toBeVisible();
  expect(submittedGroupId).toBeTruthy();
});
