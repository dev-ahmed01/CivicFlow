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
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("civicos-images"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("civicos-local"),
  S3_SECRET_ACCESS_KEY: z.string().min(8).default("civicos-local-secret"),
  S3_PUBLIC_BASE_URL: z.string().url().default("http://localhost:9000/civicos-images"),
  CLIP_INFERENCE_URL: z.string().url().optional(),
  CLIP_INFERENCE_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  VALIDATION_REBATCH_POLL_MINUTES: z.coerce.number().int().positive().default(15),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}
