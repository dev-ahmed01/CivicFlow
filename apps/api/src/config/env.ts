import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(2).default("15m"),
  JWT_REFRESH_TTL: z.string().min(2).default("30d"),
  OTP_PROVIDER: z.enum(["console"]).default("console"),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MOCK_CODE: z.string().regex(/^\d{6}$/).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}
