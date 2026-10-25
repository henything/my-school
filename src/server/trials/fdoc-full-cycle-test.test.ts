import { afterEach, expect, it, vi } from "vitest";
import { productionBookingGroups, productionParentSignupSchema, testBookableLessons, testParentSignupSchema } from "./fdoc-full-cycle-test";

afterEach(() => vi.unstubAllEnvs());

it("refuses the public test flow outside the isolated demo host", async () => {
  vi.stubEnv("FDOC_FULL_CYCLE_TEST_ENABLED", "true");
  vi.stubEnv("FDOC_BASE_URL", "https://demo.fdoc.ru");
  vi.stubEnv("FDOC_TEST_SCHOOL_ID", "00000000-0000-0000-0000-000000000001");
  vi.stubEnv("FDOC_TEST_SIGNUP_CODE", "test-only-code");
  vi.stubEnv("APP_BASE_URL", "https://production.example.com");

  await expect(testBookableLessons()).rejects.toThrow("не настроен");
});

it("requires the password confirmation to match before creating an account", () => {
  const signup = { accessCode: "code", parentPhone: "+79990000000", password: "long-password-1", passwordConfirm: "another-password" };
  expect(testParentSignupSchema.safeParse(signup).success).toBe(false);
  expect(testParentSignupSchema.safeParse({ ...signup, passwordConfirm: signup.password }).success).toBe(true);
  expect(productionParentSignupSchema.safeParse({ ...signup, passwordConfirm: "another-password" }).success).toBe(false);
});

it("keeps production booking closed until the pilot flag is enabled", async () => {
  vi.stubEnv("FDOC_PUBLIC_BOOKING_ENABLED", "false");
  await expect(productionBookingGroups()).rejects.toThrow("закрыта");
});
