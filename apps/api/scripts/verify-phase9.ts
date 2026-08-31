import assert from "node:assert/strict";
import { notificationPresentation } from "@civicos/shared";
import { prisma, UserRole } from "db";
import { createNotifications, startPushDeliveryScheduler, stopPushDeliveryScheduler, type ExpoPushMessage, type PushGateway } from "../src/notifications/service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";

const marker = { phase9Acceptance: true };
const citizenTokens = ["ExpoPushToken[phase9-citizen-device-1]", "ExpoPushToken[phase9-citizen-device-2]"];
const engineerTokens = ["ExpoPushToken[phase9-engineer-device-1]", "ExpoPushToken[phase9-engineer-device-2]"];
const allTokens = [...citizenTokens, ...engineerTokens];

class RecordingGateway implements PushGateway {
  readonly messages: ExpoPushMessage[] = [];
  async send(messages: ExpoPushMessage[]) {
    this.messages.push(...messages);
    return messages.map((_, index) => ({ status: "ok" as const, id: `phase9-receipt-${index}` }));
  }
}

async function main() {
  const [citizen, engineer, projectHead] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: UserRole.CITIZEN }, select: { id: true } }),
    prisma.user.findFirstOrThrow({ where: { role: UserRole.ENGINEER }, select: { id: true } }),
    prisma.user.findFirstOrThrow({ where: { role: UserRole.PROJECT_HEAD }, select: { id: true } }),
  ]);
  await prisma.notification.deleteMany({ where: { payload: { path: ["phase9Acceptance"], equals: true } } });
  await prisma.pushToken.deleteMany({ where: { token: { in: allTokens } } });

  let scheduler: NodeJS.Timeout | undefined;
  try {
    await prisma.pushToken.createMany({ data: [
      ...citizenTokens.map((token) => ({ userId: citizen.id, token, platform: "android" })),
      ...engineerTokens.map((token) => ({ userId: engineer.id, token, platform: "android" })),
    ] });
    const gateway = new RecordingGateway();
    scheduler = startPushDeliveryScheduler(gateway, 3_600);
    const dispatchStartedAt = Date.now();
    await createNotifications(prisma, [
      { userId: citizen.id, type: "VALIDATION_REQUEST", payload: { ...marker, ticketId: crypto.randomUUID() } },
      { userId: projectHead.id, type: "DEPENDENCY_ESCALATED", payload: { ...marker, dependencyId: crypto.randomUUID(), projectId: crypto.randomUUID() } },
      { userId: engineer.id, type: "CONFLICT_DETECTED", payload: { ...marker, projectId: crypto.randomUUID(), severity: "PROMINENT", advisory: true } },
      { userId: engineer.id, type: "SEQUENCING_RECOMMENDATION", payload: { ...marker, projectId: crypto.randomUUID(), recommendationId: crypto.randomUUID() } },
      { userId: citizen.id, type: "COMPLETION_VERIFICATION_REQUEST", payload: { ...marker, ticketId: crypto.randomUUID(), projectId: crypto.randomUUID(), evidenceId: crypto.randomUUID() } },
    ]);

    let deliveredMarkerCount = 0;
    while (Date.now() - dispatchStartedAt < 2_000) {
      deliveredMarkerCount = await prisma.notificationPushDelivery.count({
        where: { status: "DELIVERED", notification: { payload: { path: ["phase9Acceptance"], equals: true } } },
      });
      if (deliveredMarkerCount === 8) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const dispatchLatencyMs = Date.now() - dispatchStartedAt;
    const rows = await prisma.notification.findMany({
      where: { payload: { path: ["phase9Acceptance"], equals: true } },
      include: { user: { select: { role: true } }, pushDeliveries: true },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 5);
    assert.equal(rows.filter((item) => item.user.role === UserRole.PROJECT_HEAD && item.pushDeliveries.length === 0).length, 1, "Project Head delivery is in-app only");
    const mobileRows = rows.filter((item) => item.user.role === UserRole.CITIZEN || item.user.role === UserRole.ENGINEER);
    assert.equal(mobileRows.length, 4);
    assert.equal(mobileRows.every((item) => item.pushDeliveries.length === 2 && item.pushDeliveries.every((delivery) => delivery.status === "DELIVERED")), true, "Every active device token must receive each user notification");
    assert.equal(gateway.messages.filter((item) => item.data.phase9Acceptance === true).length, 8);
    assert.equal(deliveredMarkerCount, 8);
    assert.equal(dispatchLatencyMs < 2_000, true, "Committed mobile notifications must wake delivery without waiting for the safety poll");
    assert.equal(notificationPresentation("CONFLICT_DETECTED").tone, "warning", "Conflict notification must remain amber");

    const unreadBefore = await prisma.notification.count({ where: { userId: citizen.id, read: false, payload: { path: ["phase9Acceptance"], equals: true } } });
    assert.equal(unreadBefore, 2);
    await prisma.notification.updateMany({ where: { userId: citizen.id, payload: { path: ["phase9Acceptance"], equals: true } }, data: { read: true } });
    const unreadAfter = await prisma.notification.count({ where: { userId: citizen.id, read: false, payload: { path: ["phase9Acceptance"], equals: true } } });
    assert.equal(unreadAfter, 0);
    console.log(`Phase 9 acceptance verified: 5 event types, 8 Expo deliveries to two devices per mobile user dispatched in ${dispatchLatencyMs}ms, Project Head in-app delivery, amber conflicts, and authoritative unread clearing.`);
  } finally {
    if (scheduler) await stopPushDeliveryScheduler(scheduler);
    await prisma.notification.deleteMany({ where: { payload: { path: ["phase9Acceptance"], equals: true } } });
    await prisma.pushToken.deleteMany({ where: { token: { in: allTokens } } });
    await prisma.$disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
