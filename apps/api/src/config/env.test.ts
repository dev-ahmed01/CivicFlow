import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const productionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://civicos:secret@db.example.com:5432/civicos",
  JWT_ACCESS_SECRET: "access-secret-that-is-at-least-32-characters",
  JWT_REFRESH_SECRET: "refresh-secret-that-is-at-least-32-characters",
  OTP_PROVIDER: "twilio",
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
});
