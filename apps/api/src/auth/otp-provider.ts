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

export function createOtpProvider(env: AppEnv): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case "console":
      return new ConsoleOtpProvider();
  }
}
