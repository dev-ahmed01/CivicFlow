import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { TicketState, prisma } from "db";
import { createApp } from "../src/app";
import { enterPendingValidation, runValidationRebatchJob } from "../src/validations/service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 3 verification]";
const reporterId = "40000000-0000-4000-8000-000000000001";
const categoryId = "30000000-0000-4000-8000-000000000002";
const wardId = "10000000-0000-4000-8000-000000000004";
const validatorId = (number: number) => `41000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function token(userId: string): string {
  return jwt.sign({ role: "CITIZEN", agencyId: null, wardId, mustResetPassword: false, tokenType: "access" }, process.env.JWT_ACCESS_SECRET!, {
    subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients",
  });
}

async function createPendingTicket(suffix: string): Promise<string> {
  const ticketId = randomUUID();
  const observationId = randomUUID();
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
      VALUES (${ticketId}::uuid, ${categoryId}::uuid, ${reporterId}::uuid,
        ST_SetSRID(ST_MakePoint(77.5844, 12.9290), 4326), ${wardId}::uuid,
        ${TicketState.AI_CHECK_PENDING}::"TicketState", ${`${titlePrefix} ${suffix}`}, 'Jayanagar, Bengaluru', NOW(), NOW())
    `;
    await transaction.observation.create({
      data: { id: observationId, ticketId, submitterId: reporterId, imageUrl: `https://images.example.test/${ticketId}.jpg` },
    });
    await transaction.image.create({
      data: { observationId, url: `https://images.example.test/${ticketId}.jpg`, objectKey: `phase3/${ticketId}.jpg`, isPrimary: true, uploadedAt: new Date() },
    });
    await enterPendingValidation(transaction, ticketId, TicketState.AI_CHECK_PENDING);
  });
  return ticketId;
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({ where: { title: { startsWith: titlePrefix } }, select: { id: true } });
  for (const ticket of tickets) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticket.id}`;
  }
  await prisma.ticket.deleteMany({ where: { title: { startsWith: titlePrefix } } });
}

async function main(): Promise<void> {
  await cleanup();
  const app = createApp({ otpProvider: { async sendOtp() {} } });
  try {
    const ticketId = await createPendingTicket("quorum");
    const firstBatch = await prisma.validationRequest.findMany({ where: { ticketId }, orderBy: { distanceMeters: "asc" } });
    assert.equal(firstBatch.length, 15);
    assert.deepEqual(firstBatch.map((item) => item.citizenId), Array.from({ length: 15 }, (_unused, index) => validatorId(index + 1)));
    assert.equal(await prisma.notification.count({ where: { type: "VALIDATION_REQUEST", payload: { path: ["ticketId"], equals: ticketId } } }), 15);

    const reporterList = await request(app).get("/citizens/me/pending-validations").set("Authorization", `Bearer ${token(reporterId)}`).expect(200);
    assert.equal(reporterList.body.validations.some((item: { ticketId: string }) => item.ticketId === ticketId), false);
    const validatorList = await request(app).get("/citizens/me/pending-validations").set("Authorization", `Bearer ${token(validatorId(1))}`).expect(200);
    const pending = validatorList.body.validations.find((item: { ticketId: string }) => item.ticketId === ticketId);
    assert.ok(pending);
    assert.equal(typeof pending.distanceMeters, "number");
    assert.equal(typeof pending.imageUrl, "string");
    assert.equal("validationCount" in pending, false);
    assert.equal("votes" in pending, false);

    const votes = ["CONFIRM", "NOT_SURE", "REJECT"] as const;
    const quorumResponses = await Promise.all(votes.map((vote, index) => request(app)
      .post(`/tickets/${ticketId}/validate`)
      .set("Authorization", `Bearer ${token(validatorId(index + 1))}`)
      .send({ vote })
      .expect(200)));
    assert.equal(quorumResponses.filter((item) => item.body.counted).length, 3);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.ROUTED_TO_AGENCY);
    const quorumTransitions = await prisma.ticketStateTransition.findMany({ where: { ticketId, reason: "COMMUNITY_VALIDATION_QUORUM_MET" } });
    assert.equal(quorumTransitions.length, 1);

    const late = await request(app).post(`/tickets/${ticketId}/validate`).set("Authorization", `Bearer ${token(validatorId(4))}`).send({ vote: "CONFIRM" }).expect(200);
    assert.equal(late.body.recorded, true);
    assert.equal(late.body.alreadyResolved, true);
    assert.equal(late.body.counted, false);
    assert.equal(await prisma.validation.count({ where: { ticketId } }), 4);
    assert.equal(await prisma.validation.count({ where: { ticketId, counted: true } }), 3);

    const staleTicketId = await createPendingTicket("stale batch");
    await prisma.validationRequest.updateMany({ where: { ticketId: staleTicketId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const rebatch = await runValidationRebatchJob();
    assert.equal(rebatch.ticketsProcessed, 1);
    assert.equal(rebatch.notificationsCreated, 15);
    const secondBatch = await prisma.validationRequest.findMany({ where: { ticketId: staleTicketId, batchNumber: 2 }, orderBy: { distanceMeters: "asc" } });
    assert.equal(secondBatch.length, 15);
    const firstBatchCitizenIds = new Set((await prisma.validationRequest.findMany({ where: { ticketId: staleTicketId, batchNumber: 1 }, select: { citizenId: true } })).map((item) => item.citizenId));
    assert.equal(secondBatch.every((item) => !firstBatchCitizenIds.has(item.citizenId)), true);
    assert.equal(secondBatch.every((item) => item.citizenId !== reporterId), true);
    assert.equal(await prisma.validationRequest.count({ where: { ticketId: staleTicketId } }), 30);

    console.log("Phase 3 acceptance verified: nearest 15, reporter exclusion, no anchoring, atomic quorum, graceful late response, and fresh 72-hour rebatch.");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
