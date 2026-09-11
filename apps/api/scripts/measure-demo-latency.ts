import { performance } from "node:perf_hooks";
import request from "supertest";
import { createApp } from "../src/app";
import { S3CompatibleStorage } from "../src/images/storage";
import { getEnv } from "../src/config/env";
import { prisma } from "db";

// This probe creates login refresh sessions. Only the purpose-built isolated DB is allowed.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/civicflow_demo_audit") throw new Error("Latency probe requires the isolated local audit database.");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function main() {
  const app = createApp();
  const login: number[] = [];
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    const response = await request(app).post("/auth/internal/login").send({ email: "engineer.pwd@civicos.local", password: "CivicOS@123", expectedRole: "ENGINEER" });
    if (response.status !== 200) throw new Error(`Local login failed: ${response.status}`);
    login.push(performance.now() - start);
  }
  const jpeg = new Uint8Array([255,216,255,192,0,17,8,1,224,2,128,3,1,17,0,2,17,0,3,17,0,255,217]);
  let calls = 0;
  const transport: typeof fetch = async (_url, options) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return new Response(options?.method === "HEAD" ? null : jpeg, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } });
  };
  const storage = new S3CompatibleStorage(getEnv(), () => new Date(), transport);
  const verification: number[] = [];
  for (let i = 0; i < 7; i++) { const start = performance.now(); if (!await storage.verifyUpload("audit/photo.jpg", "image/jpeg")) throw new Error("Integrity fixture rejected"); verification.push(performance.now() - start); }
  console.log(JSON.stringify({ label: process.argv[2] ?? "current", login: { samples: login, medianMs: median(login), context: "Supertest local HTTP + real PostGIS + bcrypt 12 + JWT/session write; no phone/network/SecureStore" }, storage: { bytes: jpeg.length, medianMs: median(verification), calls, samples: verification, context: "Controlled 40ms injected transport per request; structural JPEG fixture; not a real camera or production upload" } }, null, 2));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
