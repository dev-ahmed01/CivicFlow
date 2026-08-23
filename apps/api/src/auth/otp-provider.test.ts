import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoOtpProvider, TwilioOtpProvider } from "./otp-provider";

afterEach(() => vi.unstubAllGlobals());

describe("TwilioOtpProvider", () => {
  it("sends the OTP through Twilio without logging or mock fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);

    await new TwilioOtpProvider("AC123", "secret", "+12025550123").sendOtp({
      phone: "+919876500001",
      code: "654321",
      expiresInMinutes: 10,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/Accounts/AC123/Messages.json");
    expect(init.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(init.body).toContain("To=%2B919876500001");
    expect(init.body).toContain("654321");
  });

  it("fails closed when Twilio rejects delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(new TwilioOtpProvider("AC123", "bad", "+12025550123").sendOtp({
      phone: "+919876500001",
      code: "654321",
      expiresInMinutes: 10,
    })).rejects.toThrow("status 401");
  });
});

describe("DemoOtpProvider", () => {
  it("does not contact a paid service or print the configured code", async () => {
    const fetchMock = vi.fn();
    const infoMock = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    await new DemoOtpProvider().sendOtp();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoMock).not.toHaveBeenCalled();
    infoMock.mockRestore();
  });
});
