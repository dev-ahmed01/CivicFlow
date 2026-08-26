import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { DependencyState, ProjectState, prisma } from "db";
import { createApp } from "../src/app";
import { runDependencyEscalationJob } from "../src/dependencies/service";
import type { ImageStorage } from "../src/images/storage";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
const bwssbAgencyId = "20000000-0000-4000-8000-000000000001";
const bwssbEngineerId = "40000000-0000-4000-8000-000000000202";
const projectIds: string[] = [];

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return {
      uploadUrl: `https://uploads.example.test/${objectKey}`,
      publicUrl: `https://images.example.test/${objectKey}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: 900,
    };
  },
  createDownload(objectKey) { return `https://images.example.test/${objectKey}`; },
  async verifyUpload() { return true; },
};

async function login(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const response = await request(app).post("/auth/internal/login").send({ email, password: "CivicOS@123" }).expect(200);
  return response.body.accessToken as string;
}

async function createProject(): Promise<string> {
  const id = randomUUID();
  projectIds.push(id);
  await prisma.project.create({ data: { id, agencyId: pwdAgencyId, state: ProjectState.CREATED } });
  return id;
}

async function createDependency(app: ReturnType<typeof createApp>, pwdToken: string, requirement: string): Promise<{ id: string; projectId: string }> {
  const projectId = await createProject();
  const response = await request(app)
    .post(`/projects/${projectId}/dependencies`)
    .set("Authorization", `Bearer ${pwdToken}`)
    .send({ dependencies: [{ respondingAgencyId: bwssbAgencyId, requirement }] })
    .expect(201);
  const dependency = response.body.dependencies[0] as { id: string; state: string; createdAt: string; deadline: string };
  assert.equal(dependency.state, DependencyState.PENDING_RESPONSE);
  const responseWindow = new Date(dependency.deadline).getTime() - new Date(dependency.createdAt).getTime();
  assert.ok(Math.abs(responseWindow - 48 * 60 * 60 * 1000) < 2_000);
  const transitions = await prisma.dependencyStateTransition.findMany({ where: { dependencyId: dependency.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(transitions.map(({ toState }) => toState), [DependencyState.REQUESTED, DependencyState.PENDING_RESPONSE]);
  return { id: dependency.id, projectId };
}

async function cleanup(): Promise<void> {
  for (const projectId of projectIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  }
  if (projectIds.length > 0) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

async function main(): Promise<void> {
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageStorage: storage });
  const [pwdToken, bwssbToken, bwssbEngineerToken] = await Promise.all([
    login(app, "head.pwd@civicos.local"),
    login(app, "head.bwssb@civicos.local"),
    login(app, "engineer.bwssb@civicos.local"),
  ]);

  try {
    const assigned = await createDependency(app, pwdToken, "Confirm water-main clearance and assign a field engineer.");
    const received = await request(app).get("/dependencies?direction=received&status=PENDING_RESPONSE").set("Authorization", `Bearer ${bwssbToken}`).expect(200);
    assert.equal(received.body.dependencies.some((item: { id: string }) => item.id === assigned.id), true);
    const sent = await request(app).get("/dependencies?direction=sent").set("Authorization", `Bearer ${pwdToken}`).expect(200);
    assert.equal(sent.body.dependencies.some((item: { id: string }) => item.id === assigned.id), true);
    await request(app).get("/dependencies?direction=received").set("Authorization", `Bearer ${pwdToken}`).expect(200).then((response) => {
      assert.equal(response.body.dependencies.some((item: { id: string }) => item.id === assigned.id), false);
    });
    await request(app).post(`/dependencies/${assigned.id}/respond`).set("Authorization", `Bearer ${bwssbToken}`).send({ action: "ASSIGN_ENGINEER", engineerId: bwssbEngineerId }).expect(200);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: assigned.id } })).state, DependencyState.ASSIGNED);
    const engineerPortal = await request(app).get("/dependencies?direction=received&status=ASSIGNED").set("Authorization", `Bearer ${bwssbEngineerToken}`).expect(200);
    const assignedTask = engineerPortal.body.dependencies.find((item: { id: string }) => item.id === assigned.id) as { assignedEngineer?: { id: string } } | undefined;
    assert.equal(assignedTask?.assignedEngineer?.id, bwssbEngineerId, "assigned dependency must appear with its owner in the Engineer portal");
    assert.equal(await prisma.notification.count({ where: { userId: bwssbEngineerId, type: "DEPENDENCY_ASSIGNMENT", payload: { path: ["dependencyId"], equals: assigned.id } } }), 1);
    await request(app).post(`/dependencies/${assigned.id}/respond`).set("Authorization", `Bearer ${bwssbEngineerToken}`).send({ action: "FULFILL" }).expect(200);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: assigned.id } })).state, DependencyState.FULFILLED);

    const unavailable = await createDependency(app, pwdToken, "Provide an available water-network crew for the proposed works.");
    await request(app).post(`/dependencies/${unavailable.id}/respond`).set("Authorization", `Bearer ${bwssbToken}`).send({ action: "DECLINE_UNAVAILABLE" }).expect(200);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: unavailable.id } })).state, DependencyState.DECLINED_UNAVAILABLE);
    await request(app).post(`/dependencies/${unavailable.id}/respond`).set("Authorization", `Bearer ${pwdToken}`).send({ action: "RESEND" }).expect(200);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: unavailable.id } })).state, DependencyState.PENDING_RESPONSE);

    const terminal = await createDependency(app, pwdToken, "Review whether the planned trench overlaps a BWSSB-owned utility.");
    await request(app).post(`/dependencies/${terminal.id}/respond`).set("Authorization", `Bearer ${bwssbToken}`).send({ action: "DECLINE_NOT_CONCERNED" }).expect(200);
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    await prisma.dependency.update({ where: { id: terminal.id }, data: { createdAt: old, deadline: old } });

    const overdue = await createDependency(app, pwdToken, "Respond to the overdue utility coordination request.");
    await prisma.dependency.update({ where: { id: overdue.id }, data: { createdAt: old, deadline: old } });
    const escalation = await runDependencyEscalationJob();
    assert.ok(escalation.escalated >= 1);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: overdue.id } })).state, DependencyState.ESCALATED);
    assert.equal(await prisma.notification.count({ where: { type: "DEPENDENCY_ESCALATED", payload: { path: ["dependencyId"], equals: overdue.id } } }), 1);
    const escalatedOutbox = await request(app).get("/dependencies?direction=sent&status=ESCALATED").set("Authorization", `Bearer ${pwdToken}`).expect(200);
    const overdueItem = escalatedOutbox.body.dependencies.find((item: { id: string }) => item.id === overdue.id) as { contacts: Array<{ email: string }> };
    assert.ok(overdueItem.contacts.some(({ email }) => email === "head.bwssb@civicos.local"));

    await runDependencyEscalationJob(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const terminalAfterJob = await prisma.dependency.findUniqueOrThrow({ where: { id: terminal.id }, include: { stateTransitions: true } });
    assert.equal(terminalAfterJob.state, DependencyState.DECLINED_NOT_CONCERNED);
    assert.equal(terminalAfterJob.assignedEngineerId, null);
    assert.equal(terminalAfterJob.stateTransitions.at(-1)?.toState, DependencyState.DECLINED_NOT_CONCERNED);

    await request(app).post(`/dependencies/${overdue.id}/respond`).set("Authorization", `Bearer ${pwdToken}`).send({ action: "MARK_ASSIGNED_OUT_OF_BAND" }).expect(200);
    assert.equal((await prisma.dependency.findUniqueOrThrow({ where: { id: overdue.id } })).state, DependencyState.ASSIGNED);

    console.log("Phase 5 acceptance verified: agency-scoped inbox/outbox, roster assignment reflected in the Engineer portal, assignment notification, all three responses, re-send, Engineer fulfillment, 48-hour escalation with contact details, out-of-band resolution, and terminal not-concerned behavior.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
