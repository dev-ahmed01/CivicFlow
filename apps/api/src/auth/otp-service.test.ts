import { describe, expect, it, vi } from "vitest";
import { resolveOtpCode } from "./otp-service";

describe("resolveOtpCode", () => {
  it("uses the explicitly configured free-demo code without generating one", () => {
    const generate = vi.fn(() => "654321");
    expect(resolveOtpCode({ DEMO_AUTH_MODE: "fixed_otp", DEMO_AUTH_CODE: "123456" }, generate)).toBe("123456");
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails closed when fixed-code mode somehow reaches the service without a code", () => {
    expect(() => resolveOtpCode({ DEMO_AUTH_MODE: "fixed_otp" })).toThrow("DEMO_AUTH_CODE");
  });

  it("preserves local mock and generated-code behavior outside demo mode", () => {
    expect(resolveOtpCode({ DEMO_AUTH_MODE: "disabled", OTP_MOCK_CODE: "111111" })).toBe("111111");
    expect(resolveOtpCode({ DEMO_AUTH_MODE: "disabled" }, () => "222222")).toBe("222222");
  });
});
