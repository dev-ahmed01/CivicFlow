import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { RequestHandler } from "express";

const timings = new AsyncLocalStorage<Array<{ stage: string; ms: number }>>();
export async function timed<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await operation(); }
  finally { timings.getStore()?.push({ stage, ms: Math.round((performance.now() - start) * 10) / 10 }); }
}
// Explicit diagnostics only. Never log credentials, OTPs, tokens, object URLs, or bodies.
export const requestTiming: RequestHandler = (request, response, next) => {
  if (process.env.PERF_TIMING !== "true") { next(); return; }
  const start = performance.now();
  const stages: Array<{ stage: string; ms: number }> = [];
  response.once("finish", () => console.info("[performance]", JSON.stringify({ method: request.method, route: request.route?.path ?? "middleware", status: response.statusCode, totalMs: Math.round((performance.now() - start) * 10) / 10, stages })));
  timings.run(stages, next);
};
