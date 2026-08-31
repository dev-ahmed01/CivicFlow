import assert from "node:assert/strict";
import request from "supertest";
import { prisma } from "db";
import { roadConflictSchema, sequencingRecommendationSchema } from "@civicos/shared";
import { createApp } from "../src/app";

const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const projects = {
  resurfacing: "82000000-0000-4000-8000-000000000001",
  pipeline: "82000000-0000-4000-8000-000000000002",
  cable: "82000000-0000-4000-8000-000000000003",
} as const;

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: demoInternalPassword }).expect(200);
  return response.body.accessToken as string;
}

async function intelligence(app: ReturnType<typeof createApp>, token: string, projectId: string) {
  const response = await request(app).get(`/projects/${projectId}/road-intelligence`).set("Authorization", `Bearer ${token}`).expect(200);
  return {
    conflicts: roadConflictSchema.array().parse(response.body.conflicts),
    recommendations: sequencingRecommendationSchema.array().parse(response.body.recommendations),
    history: response.body.interventionHistory as unknown[],
  };
}

async function main(): Promise<void> {
  const app = createApp({ otpProvider: { async sendOtp() {} } });
  const [pwdToken, bwssbToken, bescomToken] = await Promise.all([
    login(app, "head.pwd@civicos.local"),
    login(app, "head.bwssb@civicos.local"),
    login(app, "head.bescom@civicos.local"),
  ]);

  const [pwd, bwssb, bescom] = await Promise.all([
    intelligence(app, pwdToken, projects.resurfacing),
    intelligence(app, bwssbToken, projects.pipeline),
    intelligence(app, bescomToken, projects.cable),
  ]);
  assert.equal(pwd.conflicts.some((item) => item.type === "RESTORATION_TOO_EARLY"), true);
  assert.equal(bwssb.conflicts.some((item) => item.type === "RESTORATION_TOO_EARLY"), true);
  assert.equal(bescom.conflicts.some((item) => item.type === "SEQUENCING_VIOLATION"), true);
  const seededHistory = pwd.history.filter((item): item is { projectId: string } => {
    if (!item || typeof item !== "object" || !("projectId" in item)) return false;
    return Object.values(projects).includes((item as { projectId: string }).projectId as typeof projects[keyof typeof projects]);
  });
  assert.equal(seededHistory.length, 3, "Segment X history must include all three deterministic seed Intervention rows");

  const projectIds = Object.values(projects);
  const recommendation = pwd.recommendations.find((item) => projectIds.every((projectId) => item.projectIds.includes(projectId)));
  assert.ok(recommendation, "flagship recommendation must include all three deterministic seed projects");
  const fixtureOrder = recommendation.proposedOrder.filter((step) => step.synthetic || step.projectId && projectIds.includes(step.projectId as typeof projectIds[number]));
  assert.deepEqual(fixtureOrder.map((step) => step.purpose), ["pipeline", "cable", "consolidated restoration", "resurfacing"]);
  assert.deepEqual(recommendation.ruleTrace.map((trace) => trace.rule), [1, 2, 3, 4, 5, 6]);
  assert.equal(bwssb.recommendations.some((item) => item.id === recommendation.id), true, "BWSSB Project Head must see the shared recommendation");
  assert.equal(bescom.recommendations.some((item) => item.id === recommendation.id), true, "BESCOM Project Head must see the shared recommendation");

  await request(app).post(`/sequencing-recommendations/${recommendation.id}/actions`).set("Authorization", `Bearer ${pwdToken}`).send({ outcome: "MODIFIED", proposedOrder: recommendation.proposedOrder }).expect(200);
  assert.equal(await prisma.sequencingRecommendationLog.count({ where: { recommendationId: recommendation.id, outcome: "MODIFIED" } }) > 0, true, "manual order modification must be logged");

  await request(app).post(`/sequencing-recommendations/${recommendation.id}/actions`).set("Authorization", `Bearer ${pwdToken}`).send({ outcome: "DISMISSED" }).expect(200);
  assert.equal(await prisma.sequencingRecommendationLog.count({ where: { recommendationId: recommendation.id, outcome: "DISMISSED" } }) > 0, true, "dismissal must be logged");

  await request(app).post(`/sequencing-recommendations/${recommendation.id}/actions`).set("Authorization", `Bearer ${pwdToken}`).send({
    outcome: "ACCEPTED",
    timelineRevision: { projectId: projects.resurfacing, plannedStart: "2027-06-22T00:00:00.000Z", plannedEnd: "2027-06-26T23:59:59.999Z" },
  }).expect(200);
  const revised = await prisma.project.findUniqueOrThrow({ where: { id: projects.resurfacing }, include: { intervention: true } });
  assert.equal(revised.plannedStart?.toISOString(), "2027-06-22T00:00:00.000Z");
  assert.equal(revised.intervention?.plannedStart.toISOString(), revised.plannedStart?.toISOString(), "Intervention and Project timelines must remain mirrored");
  assert.equal(await prisma.sequencingRecommendationLog.count({ where: { recommendationId: recommendation.id, outcome: "ACCEPTED" } }) > 0, true);

  console.log("Phase 8 acceptance verified: Segment X history, restoration/sequencing warnings, three-agency deterministic order, explainability trace, shared visibility, non-blocking date acceptance, and logged modify/dismiss actions.");
  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
