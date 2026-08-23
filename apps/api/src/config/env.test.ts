import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const productionEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_PROFILE: "production",
  DATABASE_URL: "postgresql://civicos:secret@db.example.com:5432/civicos",
  JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
  OTP_PROVIDER: "twilio",
  DEMO_AUTH_MODE: "disabled",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "twilio-secret",
  TWILIO_FROM_NUMBER: "+12025550123",
  S3_ENDPOINT: "https://storage.example.com",
  S3_REGION: "auto",
  S3_BUCKET: "civicos-images",
  S3_ACCESS_KEY_ID: "production-access-key",
  S3_SECRET_ACCESS_KEY: "production-secret-key",
  S3_PUBLIC_BASE_URL: "https://images.example.com",
  CLIP_INFERENCE_URL: "https://clip.example.com/infer",
  CLIP_INFERENCE_TOKEN: "clip-secret",
  CLIP_MODE: "hosted",
  CORS_ORIGINS: "https://civicos.example.com,https://civicos-web.vercel.app",
} satisfies NodeJS.ProcessEnv;

describe("production environment", () => {
  it("accepts fully configured production services", () => {
    expect(parseEnv(productionEnv).OTP_PROVIDER).toBe("twilio");
  });

  it("rejects console OTP, mock codes, and localhost storage", () => {
    expect(() => parseEnv({
      ...productionEnv,
      OTP_PROVIDER: "console",
      OTP_MOCK_CODE: "123456",
      S3_ENDPOINT: "http://localhost:9000",
    })).toThrow();
  });

  it("requires hosted CLIP inference and deployed CORS origins", () => {
    const invalid: NodeJS.ProcessEnv = { ...productionEnv };
    delete invalid.CLIP_INFERENCE_URL;
    delete invalid.CORS_ORIGINS;
    expect(() => parseEnv(invalid)).toThrow();
  });

  it("rejects every demo authentication or deterministic relevance switch", () => {
    expect(() => parseEnv({
      ...productionEnv,
      OTP_PROVIDER: "demo",
      DEMO_AUTH_MODE: "fixed_otp",
      DEMO_AUTH_CODE: "123456",
      CLIP_MODE: "demo_deterministic",
    })).toThrow();
  });
});

describe("free-demo environment", () => {
  const freeDemoEnv = {
    ...productionEnv,
    DEPLOYMENT_PROFILE: "free_demo",
    OTP_PROVIDER: "demo",
    DEMO_AUTH_MODE: "fixed_otp",
    DEMO_AUTH_CODE: "123456",
    TWILIO_ACCOUNT_SID: undefined,
    TWILIO_AUTH_TOKEN: undefined,
    TWILIO_FROM_NUMBER: undefined,
    S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
    S3_REGION: "auto",
    S3_PUBLIC_BASE_URL: "https://pub-demo.r2.dev",
    CLIP_MODE: "demo_deterministic",
    CLIP_INFERENCE_URL: undefined,
    CLIP_INFERENCE_TOKEN: undefined,
  } satisfies NodeJS.ProcessEnv;

  it("accepts the explicitly selected zero-cost services", () => {
    const parsed = parseEnv(freeDemoEnv);
    expect(parsed.DEPLOYMENT_PROFILE).toBe("free_demo");
    expect(parsed.DEMO_AUTH_MODE).toBe("fixed_otp");
    expect(parsed.CLIP_MODE).toBe("demo_deterministic");
  });

  it("does not infer demo authentication from a demo provider alone", () => {
    expect(() => parseEnv({ ...freeDemoEnv, DEMO_AUTH_MODE: "disabled", DEMO_AUTH_CODE: undefined })).toThrow();
  });

  it("rejects local object storage even in the free-demo profile", () => {
    expect(() => parseEnv({ ...freeDemoEnv, S3_ENDPOINT: "http://localhost:9000" })).toThrow();
  });
});
