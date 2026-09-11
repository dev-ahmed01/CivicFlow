import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.endsWith("_test"), "Use an isolated localhost database ending in _test");
const prisma = new PrismaClient();
const root = resolve(process.cwd(), "../..");
const pnpm = resolve(root, "node_modules/pnpm/bin/pnpm.cjs");

async function snapshot() {
  const tables = ["User", "Ticket", "Project", "Observation", "Image", "Validation", "InspectionReport", "InspectionEvidence", "CompletionEvidence", "CompletionVerificationRequest", "Notification", "Ward", "RoadSegment"];
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(string_agg(row_to_json(t)::text, '' ORDER BY t."id")) AS digest FROM "${table}" t`);
  return result;
}

async function main() {
  assert.ok(await prisma.ticket.count(), "Seed the isolated database before verifying populated-data preservation");
  const before = await snapshot();
  const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260911100000_jain_campus_reporting_area/migration.sql"), "utf8");
  for (let run = 0; run < 2; run++) {
    await prisma.$transaction(async (tx) => {
      for (const sql of migration.split(";").filter((part) => part.trim())) await tx.$executeRawUnsafe(sql);
    });
    const seed = spawnSync(process.execPath, [pnpm, "--filter", "db", "seed:run"], {
      cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "test", DEPLOYMENT_PROFILE: "local", DEMO_SEED_MODE: "if_empty", ALLOW_DEMO_RESET: "false" },
    });
    assert.equal(seed.status, 0, seed.stderr + seed.stdout);
    assert.match(seed.stdout, /Application seed skipped/);
    assert.deepEqual(await snapshot(), before, "Repeated migration/seed changed existing records");
  }
  console.log("PASS: campus migration and if_empty seed each rerun twice on a populated database; full-row hashes and counts unchanged across 14 application/reference tables. Reset disabled.");
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
