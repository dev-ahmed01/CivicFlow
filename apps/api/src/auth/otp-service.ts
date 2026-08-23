import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma, UserRole } from "db";
import { getEnv } from "../config/env";
import type { AppEnv } from "../config/env";
import type { OtpProvider } from "./otp-provider";
import { issueTokens } from "./tokens";

type OtpCodeEnvironment = Pick<AppEnv, "DEMO_AUTH_MODE" | "DEMO_AUTH_CODE" | "OTP_MOCK_CODE">;

export function resolveOtpCode(env: OtpCodeEnvironment, generate = () => randomInt(100000, 1000000).toString()): string {
  if (env.DEMO_AUTH_MODE === "fixed_otp") {
    if (!env.DEMO_AUTH_CODE) throw new Error("DEMO_AUTH_CODE is required for fixed-code demo authentication");
    return env.DEMO_AUTH_CODE;
  }
  return env.OTP_MOCK_CODE ?? generate();
}

async function configuredMaxAttempts(): Promise<number> {
  const config = await prisma.adminConfig.findUnique({
    where: { key: "auth.otp_max_attempts" },
  });
  if (typeof config?.value !== "number" || config.value < 1) {
    throw new Error("AdminConfig auth.otp_max_attempts is missing or invalid");
  }
  return config.value;
}

export async function requestCitizenOtp(
  phone: string,
  provider: OtpProvider,
): Promise<void> {
  const env = getEnv();
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role: UserRole.CITIZEN },
  });

  if (user.role !== UserRole.CITIZEN) {
    throw new Error("Phone identity is not a citizen account");
  }

  const code = resolveOtpCode(env);
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);

  await prisma.$transaction([
    prisma.otpChallenge.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpChallenge.create({
      data: { userId: user.id, codeHash, expiresAt },
    }),
  ]);

  await provider.sendOtp({
    phone,
    code,
    expiresInMinutes: env.OTP_TTL_MINUTES,
  });
}

export async function verifyCitizenOtp(phone: string, code: string) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.role !== UserRole.CITIZEN) {
    throw new Error("Invalid or expired OTP");
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const maxAttempts = await configuredMaxAttempts();

  if (
    !challenge ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= maxAttempts
  ) {
    throw new Error("Invalid or expired OTP");
  }

  const valid = await bcrypt.compare(code, challenge.codeHash);
  if (!valid) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new Error("Invalid or expired OTP");
  }

  const verifiedUser = await prisma.$transaction(async (transaction) => {
    await transaction.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return transaction.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: new Date() },
    });
  });

  return {
    user: verifiedUser,
    tokens: await issueTokens(verifiedUser),
  };
}
