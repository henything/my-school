import { afterEach, describe, expect, it } from "vitest";
import { buildTokenUrl, publicOriginFromRequest } from "./url";

describe("public URL helpers", () => {
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.APP_BASE_URL = originalAppBaseUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
  });

  it("uses forwarded production host instead of internal localhost request URL", () => {
    process.env.APP_BASE_URL = "";
    process.env.NEXT_PUBLIC_APP_URL = "";

    const request = new Request("http://localhost:3000/api/admin/parent-accounts/invites", {
      headers: {
        "x-forwarded-host": "azbukadvizheniya.ru",
        "x-forwarded-proto": "https"
      }
    });

    expect(buildTokenUrl(request, "/parent/activate", "invite-token")).toBe(
      "https://azbukadvizheniya.ru/parent/activate?token=invite-token"
    );
  });

  it("prefers configured app origin when present", () => {
    process.env.APP_BASE_URL = "https://azbukadvizheniya.ru/";
    process.env.NEXT_PUBLIC_APP_URL = "";

    const request = new Request("http://localhost:3000/api/parent/invoices/invoice-id/pay");

    expect(publicOriginFromRequest(request)).toBe("https://azbukadvizheniya.ru");
  });
});
