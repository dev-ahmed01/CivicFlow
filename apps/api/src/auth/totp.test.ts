import { describe, expect, it } from "vitest";
import { createTotpSecret, totpUri, verifyTotp } from "./totp";

describe("admin TOTP", () => {
  it("verifies the RFC 6238 SHA-1 vector using six digits", () => {
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", 59_000)).toBe(false);
  });

  it("creates a standards-compatible secret and otpauth URI", () => {
    const secret = createTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri(secret, "admin@civicos.local")).toContain(`secret=${secret}`);
    expect(totpUri(secret, "admin@civicos.local")).toContain("issuer=CivicOS");
  });
});
