import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { insightsBenchmarkSchema, type InsightsBenchmark } from "@civicos/shared";

export const benchmarkPath = () => process.env.INSIGHTS_BENCHMARK_PATH || resolve(process.cwd(), "artifacts/insights-benchmark.json");
export async function readInsightsBenchmark(): Promise<InsightsBenchmark | null> {
  try { return insightsBenchmarkSchema.parse(JSON.parse(await readFile(benchmarkPath(), "utf8"))); }
  catch { return null; }
}
