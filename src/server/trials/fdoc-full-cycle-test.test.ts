import { afterEach, expect, it, vi } from "vitest";
import { testBookableLessons } from "./fdoc-full-cycle-test";

afterEach(() => vi.unstubAllEnvs());

it("refuses the public test flow outside the isolated demo host", async () => {
  vi.stubEnv("FDOC_FULL_CYCLE_TEST_ENABLED", "true");
  vi.stubEnv("FDOC_BASE_URL", "https://demo.fdoc.ru");
  vi.stubEnv("FDOC_TEST_SCHOOL_ID", "00000000-0000-0000-0000-000000000001");
  vi.stubEnv("FDOC_TEST_SIGNUP_CODE", "test-only-code");
  vi.stubEnv("APP_BASE_URL", "https://production.example.com");

  await expect(testBookableLessons()).rejects.toThrow("не настроен");
});
