import "dotenv/config";
import { prisma } from "db";
import { createApp } from "../src/app";

process.env.NODE_ENV = "test";
process.env.OTP_PROVIDER = "console";
process.env.OTP_MOCK_CODE ??= "123456";

const app = createApp();
const server = app.listen(0);

async function jsonRequest(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine verification server port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const citizenPhone = "+919876500001";

  const otpRequest = await jsonRequest(baseUrl, "/auth/citizen/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone: citizenPhone }),
  });
  if (otpRequest.status !== 202) throw new Error(`OTP request failed: ${otpRequest.status}`);

  const citizenLogin = await jsonRequest(baseUrl, "/auth/citizen/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone: citizenPhone, code: process.env.OTP_MOCK_CODE }),
  });
  if (
    citizenLogin.status !== 200 ||
    typeof citizenLogin.body.accessToken !== "string" ||
    typeof citizenLogin.body.refreshToken !== "string"
  ) {
    throw new Error(`Citizen login failed: ${citizenLogin.status}`);
  }

  const citizenDenied = await jsonRequest(baseUrl, "/protected/project-head", {
    headers: { authorization: `Bearer ${citizenLogin.body.accessToken}` },
  });
  if (citizenDenied.status !== 403) {
    throw new Error(`Expected citizen to receive 403, received ${citizenDenied.status}`);
  }

  const headLogin = await jsonRequest(baseUrl, "/auth/internal/login", {
    method: "POST",
    body: JSON.stringify({
      email: "head.pwd@civicos.local",
      password: "CivicOS@123",
    }),
  });
  if (
    headLogin.status !== 200 ||
    typeof headLogin.body.accessToken !== "string" ||
    typeof headLogin.body.refreshToken !== "string"
  ) {
    throw new Error(`Project Head login failed: ${headLogin.status}`);
  }

  const headAllowed = await jsonRequest(baseUrl, "/protected/project-head", {
    headers: { authorization: `Bearer ${headLogin.body.accessToken}` },
  });
  if (headAllowed.status !== 200) {
    throw new Error(`Expected Project Head access, received ${headAllowed.status}`);
  }

  console.log("PASS citizen OTP login returned access and refresh JWTs");
  console.log("PASS citizen JWT received 403 on Project-Head-only route");
  console.log("PASS seeded Project Head login returned tokens and received 200 on the same route");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    server.close();
    await prisma.$disconnect();
  });
