import type { AppEnv } from "../config/env";

export interface OtpDelivery {
  phone: string;
  code: string;
  expiresInMinutes: number;
}

export interface OtpProvider {
  sendOtp(delivery: OtpDelivery): Promise<void>;
}

export class ConsoleOtpProvider implements OtpProvider {
  async sendOtp(delivery: OtpDelivery): Promise<void> {
    console.info(
      `[local OTP] ${delivery.phone}: ${delivery.code} (expires in ${delivery.expiresInMinutes} minutes)`,
    );
  }
}

// SIH free-demo profile only. The code is configured explicitly and is never logged or returned by the API.
export class DemoOtpProvider implements OtpProvider {
  async sendOtp(): Promise<void> {}
}

export class TwilioOtpProvider implements OtpProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async sendOtp(delivery: OtpDelivery): Promise<void> {
    const form = new URLSearchParams({
      To: delivery.phone,
      From: this.fromNumber,
      Body: `Your City Connect verification code is ${delivery.code}. It expires in ${delivery.expiresInMinutes} minutes.`,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!response.ok) throw new Error(`Twilio OTP delivery failed with status ${response.status}`);
  }
}

export function createOtpProvider(env: AppEnv): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case "console":
      return new ConsoleOtpProvider();
    case "demo":
      if (env.DEPLOYMENT_PROFILE !== "free_demo" || env.DEMO_AUTH_MODE !== "fixed_otp" || !env.DEMO_AUTH_CODE) {
        throw new Error("Demo OTP delivery is only available in the explicit free-demo profile");
      }
      return new DemoOtpProvider();
    case "twilio":
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
        throw new Error("Twilio OTP credentials are incomplete");
      }
      return new TwilioOtpProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_NUMBER);
  }
}
