import { z } from "zod";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEPLOYMENT_PROFILE: z.enum(["local", "free_demo", "production"]).optional(),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(2).default("15m"),
  JWT_REFRESH_TTL: z.string().min(2).default("30d"),
  OTP_PROVIDER: z.enum(["console", "demo", "twilio"]).default("console"),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MOCK_CODE: z.string().regex(/^\d{6}$/).optional(),
  DEMO_AUTH_MODE: z.enum(["disabled", "fixed_otp"]).default("disabled"),
  DEMO_AUTH_CODE: z.string().regex(/^\d{6}$/).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_FROM_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("civicos-images"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("civicos-local"),
  S3_SECRET_ACCESS_KEY: z.string().min(8).default("civicos-local-secret"),
  S3_PUBLIC_BASE_URL: z.string().url().default("http://localhost:9000/civicos-images"),
  CLIP_INFERENCE_URL: z.string().url().optional(),
  CLIP_INFERENCE_TOKEN: z.string().min(1).optional(),
  CLIP_MODE: z.enum(["auto", "hosted", "demo_deterministic"]).default("auto"),
  CLIP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  CRON_SECRET: z.string().min(32).optional(),
  VALIDATION_REBATCH_POLL_MINUTES: z.coerce.number().int().positive().default(15),
  DEPENDENCY_ESCALATION_POLL_MINUTES: z.coerce.number().int().positive().default(15),
  DEADLINE_ESCALATION_POLL_MINUTES: z.coerce.number().int().positive().default(15),
  DEMO_NOTIFY_ALL_CITIZENS: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  PUSH_DELIVERY_POLL_SECONDS: z.coerce.number().int().positive().default(15),
  EXPO_ACCESS_TOKEN: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  CORS_ORIGINS: z.string().min(1).optional(),
});

const deployedStorageEnvSchema = z.object({
  S3_ENDPOINT: z.string().trim().min(1),
  S3_REGION: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(1),
  S3_ACCESS_KEY_ID: z.string().trim().min(1),
  S3_SECRET_ACCESS_KEY: z.string().trim().min(1),
  S3_PUBLIC_BASE_URL: z.string().trim().min(1),
});

const envSchema = baseEnvSchema.transform((env) => ({
  ...env,
  DEPLOYMENT_PROFILE: env.DEPLOYMENT_PROFILE ?? (env.NODE_ENV === "production" ? "production" : "local"),
})).superRefine((env, context) => {
  const demoAuthenticationSelected = env.OTP_PROVIDER === "demo" || env.DEMO_AUTH_MODE !== "disabled" || Boolean(env.DEMO_AUTH_CODE);
  if (demoAuthenticationSelected && (
    env.DEPLOYMENT_PROFILE !== "free_demo" ||
    env.OTP_PROVIDER !== "demo" ||
    env.DEMO_AUTH_MODE !== "fixed_otp" ||
    !env.DEMO_AUTH_CODE
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEMO_AUTH_MODE"], message: "Demo authentication requires the explicit free-demo profile, provider, mode, and code" });
  }
  if (env.DEPLOYMENT_PROFILE === "free_demo" && env.NODE_ENV !== "production") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEPLOYMENT_PROFILE"], message: "The free-demo deployment profile must run with NODE_ENV=production" });
  }
  if (env.NODE_ENV !== "production") return;

  if (env.DEPLOYMENT_PROFILE === "local") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEPLOYMENT_PROFILE"], message: "A production Node environment cannot use the local deployment profile" });
  }
  if (env.OTP_MOCK_CODE) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["OTP_MOCK_CODE"], message: "OTP_MOCK_CODE is forbidden in deployed environments" });
  }

  if (env.DEPLOYMENT_PROFILE === "production") {
    if (env.OTP_PROVIDER !== "twilio") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["OTP_PROVIDER"], message: "The production profile must use the Twilio OTP provider" });
    }
    if (env.DEMO_AUTH_MODE !== "disabled" || env.DEMO_AUTH_CODE || env.OTP_PROVIDER === "demo") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEMO_AUTH_MODE"], message: "Demo authentication is forbidden in the production profile" });
    }
    if (env.CLIP_MODE !== "hosted") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["CLIP_MODE"], message: "The production profile must use hosted CLIP inference" });
    }
  }

  if (env.DEPLOYMENT_PROFILE === "free_demo") {
    if (env.OTP_PROVIDER !== "demo" || env.DEMO_AUTH_MODE !== "fixed_otp" || !env.DEMO_AUTH_CODE) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEMO_AUTH_MODE"], message: "The free-demo profile requires explicit fixed-code demo authentication" });
    }
    if (env.CLIP_MODE === "auto") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["CLIP_MODE"], message: "The free-demo profile requires an explicit CLIP mode" });
    }
  }

  const requiredServiceKeys = env.DEPLOYMENT_PROFILE === "production"
    ? ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "CORS_ORIGINS"] as const
    : ["CORS_ORIGINS"] as const;
  for (const key of requiredServiceKeys) {
    if (!env[key]) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production` });
  }
  if (env.CLIP_MODE === "hosted" && !env.CLIP_INFERENCE_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["CLIP_INFERENCE_URL"], message: "Hosted CLIP mode requires CLIP_INFERENCE_URL" });
  }
  for (const [key, value] of [["S3_ENDPOINT", env.S3_ENDPOINT], ["S3_PUBLIC_BASE_URL", env.S3_PUBLIC_BASE_URL]] as const) {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const privateIpv4 = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
    if (parsed.protocol !== "https:" || hostname === "localhost" || privateIpv4) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must be a public HTTPS URL in production` });
    }
  }
  if (env.S3_ACCESS_KEY_ID === "civicos-local" || env.S3_SECRET_ACCESS_KEY === "civicos-local-secret") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_ACCESS_KEY_ID"], message: "Local object-storage credentials are forbidden in production" });
  }
  if (env.CORS_ORIGINS) {
    for (const origin of env.CORS_ORIGINS.split(",").map((item) => item.trim())) {
      if (!z.string().url().safeParse(origin).success || new URL(origin).protocol !== "https:") {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: `Invalid CORS origin: ${origin}` });
      }
    }
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(values: NodeJS.ProcessEnv): AppEnv {
  if (values.NODE_ENV === "production" || values.DEPLOYMENT_PROFILE === "free_demo" || values.DEPLOYMENT_PROFILE === "production") {
    // Presigning cannot safely use local defaults on Railway or another deployment.
    deployedStorageEnvSchema.parse(values);
  }
  return envSchema.parse(values);
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}
