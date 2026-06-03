import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores passwords as Argon2id hashes", async () => {
    const hash = await hashPassword("VeryStrong123!");

    expect(hash).toContain("argon2id");
    expect(hash).not.toContain("VeryStrong123!");
    await expect(verifyPassword(hash, "VeryStrong123!")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("VeryStrong123!");

    await expect(verifyPassword(hash, "WrongPassword123!")).resolves.toBe(false);
  });
});
