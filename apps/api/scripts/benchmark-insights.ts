import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { Prisma, prisma, ProjectState, type PrismaClient } from "db";
import { insightsBenchmarkSchema, type InsightsBenchmark } from "@civicos/shared";
import { checkProjectConflicts } from "../src/conflicts/service";
import { routeRelevantWebTicket } from "../src/routing/service";
import { buildSequencingRecommendation, type RoadInterventionRecord } from "../src/road-intelligence/service";
import { resolveWardGeometry } from "../src/civic-works/ward-resolution";
import { benchmarkPath } from "../src/analytics/validation";

const id = (n: number) => `be000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (n: number) => new Date(Date.UTC(2099, 0, n));
const rollback = new Error("ROLLBACK_CONTROLLED_BENCHMARK");
type Suite = InsightsBenchmark["suites"][number];
const suite = (name: string, scope: string): Suite => ({ name, scope, total: 0, correct: 0, cases: [] });
function record(s: Suite, name: string, expected: unknown, actual: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected), passed = a === e;
  s.cases.push({ name, expected: e, actual: a, passed }); s.total++; if (passed) s.correct++;
}

// Full engines and real PostGIS; all fixture/config writes are rolled back, including on failure.
export async function runInsightsBenchmark(client: PrismaClient = prisma): Promise<InsightsBenchmark> {
  const conflict = suite("Conflict detection", "Generic production conflict engine against controlled PostGIS project pairs; date, radius, ward, state and geometry cases.");
  conflict.confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const routing = suite("Agency routing", "Production category routing with persisted configured categories and ticket state transitions.");
  const sequencing = suite("Road sequencing", "Production deterministic recommendation builder; prerequisites, utility/restoration order and cancelled works.");
  const spatial = suite("Spatial / ward resolution", "Production planned-work ward resolver against controlled polygons using real PostGIS ST_Covers; synthetic geography, not a survey of Bengaluru boundary accuracy.");
  await client.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO "Ward" ("id", "name", "boundary") VALUES (${id(1)}::uuid, 'Insights benchmark west', ST_GeomFromText('POLYGON((-30 0,-29 0,-29 1,-30 1,-30 0))',4326)), (${id(2)}::uuid, 'Insights benchmark east', ST_GeomFromText('POLYGON((-29 0,-28 0,-28 1,-29 1,-29 0))',4326))`;
    for (let i = 0; i < 3; i++) await tx.agency.create({ data: { id: id(10 + i), name: `Insights benchmark agency ${i}`, type: "CONTROLLED_TEST" } });
    await tx.systemConfig.upsert({ where: { key: "conflict.radius_meters" }, create: { key: "conflict.radius_meters", value: 100, description: "Temporary controlled benchmark" }, update: { value: 100 } });
    for (let i = 0; i < 2; i++) await tx.project.create({ data: { id: id(20 + i), referenceNumber: `BENCH-WORK-${i}`, title: "Controlled conflict fixture", agencyId: id(10 + i), state: "ACTIVE", plannedStart: day(1), plannedEnd: day(10) } });
    await tx.$executeRaw`UPDATE "Project" SET "geometry" = ST_SetSRID(ST_MakePoint(-29.5,0.5),4326) WHERE "id" = ${id(20)}::uuid`;
    const cases = [
      { name: "Near, full date overlap", x: -29.5001, start: 1, end: 10, expected: true },
      { name: "Near, partial date overlap", x: -29.5001, start: 9, end: 12, expected: true },
      { name: "Inclusive touching dates", x: -29.5001, start: 10, end: 12, expected: true },
      { name: "Near, disjoint dates", x: -29.5001, start: 11, end: 12, expected: false },
      { name: "Far, overlapping dates", x: -28.5, start: 1, end: 10, expected: false },
      { name: "Far, same ward", x: -28.5, start: 1, end: 10, ward: true, expected: true },
      { name: "Cancelled candidate", x: -29.5001, start: 1, end: 10, cancelled: true, expected: false },
      { name: "Missing candidate dates", x: -29.5001, start: 1, end: 10, missing: true, expected: false },
      { name: "Outside radius", x: -29.502, start: 1, end: 10, expected: false },
      { name: "Inside radius", x: -29.5005, start: 1, end: 10, expected: true },
    ];
    for (const c of cases) {
      await tx.project.update({ where: { id: id(20) }, data: { wardId: c.ward ? id(1) : null } });
      await tx.project.update({ where: { id: id(21) }, data: { state: c.cancelled ? "CANCELLED" : "ACTIVE", cancelledAt: c.cancelled ? day(1) : null, cancellationReason: c.cancelled ? "Controlled benchmark cancellation" : null, wardId: c.ward ? id(1) : null, plannedStart: c.missing ? null : day(c.start), plannedEnd: c.missing ? null : day(c.end) } });
      await tx.$executeRaw`UPDATE "Project" SET "geometry" = ST_SetSRID(ST_MakePoint(${c.x},0.5),4326) WHERE "id" = ${id(21)}::uuid`;
      const result = (await checkProjectConflicts(tx, id(20))).some(r => r.conflictingProjectId === id(21));
      record(conflict, c.name, c.expected, result);
      conflict.confusion![c.expected ? result ? "tp" : "fn" : result ? "fp" : "tn"]++;
    }
    for (let i = 0; i < 6; i++) {
      const categoryId = id(30 + i), ticketId = id(40 + i), agencyId = id(10 + i % 3);
      await tx.category.create({ data: { id: categoryId, name: `Insights controlled category ${i}`, primaryAgencyId: agencyId, relevancePrompt: "Controlled routing scenario" } });
      await tx.$executeRaw`INSERT INTO "Ticket" ("id", "referenceNumber", "categoryId", "coordinates", "wardId", "state", "updatedAt") VALUES (${ticketId}::uuid, ${`BENCH-TICKET-${i}`}, ${categoryId}::uuid, ST_SetSRID(ST_MakePoint(-29.5,0.5),4326), ${id(1)}::uuid, 'AI_CHECK_PENDING', NOW())`;
      const assigned = await routeRelevantWebTicket(tx, ticketId);
      const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { assignedAgencyId: true, state: true } });
      record(routing, `Configured category ${i + 1}`, [agencyId, agencyId, "ROUTED_TO_AGENCY"], [assigned, ticket.assignedAgencyId, ticket.state]);
    }
    for (const c of [
      { name: "West interior", xy: [-29.5, 0.5], ward: id(1) }, { name: "East interior", xy: [-28.5, 0.5], ward: id(2) },
      { name: "Outer boundary included", xy: [-30, 0.5], ward: id(1) }, { name: "Corner included", xy: [-30, 0], ward: id(1) },
      { name: "Shared edge uses stable ID", xy: [-29, 0.5], ward: id(1) }, { name: "Outside both wards", xy: [-31, 0.5], ward: null },
      { name: "Outside above", xy: [-29.5, 1.01], ward: null }, { name: "Just inside west edge", xy: [-29.999, 0.5], ward: id(1) },
    ]) record(spatial, c.name, c.ward, (await resolveWardGeometry(tx, { type: "Point", coordinates: c.xy }))[0]?.id ?? null);
    throw rollback;
  }, { timeout: 60_000 }).catch(error => { if (error !== rollback) throw error; });
  const intervention = (n: number, purpose: string, extra: Partial<RoadInterventionRecord> = {}): RoadInterventionRecord => ({ id: id(n), projectId: id(n + 100), segmentId: id(1), agencyId: id(10), agencyName: "Controlled agency", purpose, plannedStart: day(1), plannedEnd: day(5), affectedLengthM: 100, startOffsetM: 0, dependencyRefs: [], createdAt: day(1), projectState: ProjectState.ACTIVE, hasUnresolvedDependencies: false, ...extra });
  const pipe = intervention(60, "pipeline"), cable = intervention(61, "cable", { dependencyRefs: [pipe.id] }), road = intervention(62, "resurfacing", { plannedStart: day(6), plannedEnd: day(7) });
  for (const [name, inputs, expected] of [
    ["Prerequisite precedes dependent", [road, cable, pipe], [pipe.projectId, cable.projectId, road.projectId]],
    ["Order independent of input arrangement", [cable, pipe, road], [pipe.projectId, cable.projectId, road.projectId]],
    ["Single utility then restoration", [road, pipe], [pipe.projectId, road.projectId]],
    ["No restoration, no recommendation", [pipe, cable], null],
    ["No utility, no recommendation", [road], null],
    ["Cancelled utility excluded", [{ ...pipe, projectState: ProjectState.CANCELLED }, road], null],
  ] as const) {
    const r = buildSequencingRecommendation([...inputs]);
    record(sequencing, name, expected, r ? r.proposedOrder.filter(p => !p.synthetic).map(p => p.projectId) : null);
  }
  let revision = "unknown";
  try { revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(); if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", windowsHide: true }).trim()) revision += "-working-tree"; } catch { /* Artifact explicitly records unavailable provenance. */ }
  return insightsBenchmarkSchema.parse({ version: 1, generatedAt: new Date().toISOString(), revision, suites: [conflict, routing, sequencing, spatial] });
}

async function main() {
  process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error("Run controlled fixtures only against a local test database");
  const result = await runInsightsBenchmark();
  const path = benchmarkPath(); await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(result, null, 2)); await rename(`${path}.tmp`, path);
  console.log(JSON.stringify(result, null, 2));
  if (result.suites.some(s => s.correct !== s.total)) process.exitCode = 1;
}
if (require.main === module) void main().catch(error => { console.error(error instanceof Prisma.PrismaClientInitializationError ? "Local benchmark database unavailable; no validation result generated." : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
