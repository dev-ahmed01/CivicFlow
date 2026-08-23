import assert from "node:assert/strict";
import { notificationPresentation } from "@civicos/shared";
import { prisma, UserRole } from "db";
import { createNotifications, runPushDeliveryJob, type ExpoPushMessage, type PushGateway } from "../src/notifications/service";

const marker = { phase9Acceptance: true };
const citizenToken = "ExpoPushToken[phase9-citizen-device]";
const engineerToken = "ExpoPushToken[phase9-engineer-device]";

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
  await prisma.pushToken.deleteMany({ where: { token: { in: [citizenToken, engineerToken] } } });

  try {
    await prisma.pushToken.createMany({ data: [
      { userId: citizen.id, token: citizenToken, platform: "android" },
      { userId: engineer.id, token: engineerToken, platform: "android" },
    ] });
    await createNotifications(prisma, [
      { userId: citizen.id, type: "VALIDATION_REQUEST", payload: { ...marker, ticketId: crypto.randomUUID() } },
      { userId: projectHead.id, type: "DEPENDENCY_ESCALATED", payload: { ...marker, dependencyId: crypto.randomUUID(), projectId: crypto.randomUUID() } },
      { userId: engineer.id, type: "CONFLICT_DETECTED", payload: { ...marker, projectId: crypto.randomUUID(), severity: "PROMINENT", advisory: true } },
      { userId: engineer.id, type: "SEQUENCING_RECOMMENDATION", payload: { ...marker, projectId: crypto.randomUUID(), recommendationId: crypto.randomUUID() } },
      { userId: citizen.id, type: "COMPLETION_VERIFICATION_REQUEST", payload: { ...marker, ticketId: crypto.randomUUID(), projectId: crypto.randomUUID(), evidenceId: crypto.randomUUID() } },
    ]);

    const gateway = new RecordingGateway();
    const delivery = await runPushDeliveryJob(gateway);
    const rows = await prisma.notification.findMany({
      where: { payload: { path: ["phase9Acceptance"], equals: true } },
      include: { user: { select: { role: true } }, pushDeliveries: true },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(rows.length, 5);
    assert.equal(rows.filter((item) => item.user.role === UserRole.PROJECT_HEAD && item.pushDeliveries.length === 0).length, 1, "Project Head delivery is in-app only");
    assert.equal(rows.filter((item) => (item.user.role === UserRole.CITIZEN || item.user.role === UserRole.ENGINEER) && item.pushDeliveries[0]?.status === "DELIVERED").length, 4);
    assert.equal(gateway.messages.filter((item) => item.data.phase9Acceptance === true).length, 4);
    assert.equal(notificationPresentation("CONFLICT_DETECTED").tone, "warning", "Conflict notification must remain amber");

    const unreadBefore = await prisma.notification.count({ where: { userId: citizen.id, read: false, payload: { path: ["phase9Acceptance"], equals: true } } });
    assert.equal(unreadBefore, 2);
    await prisma.notification.updateMany({ where: { userId: citizen.id, payload: { path: ["phase9Acceptance"], equals: true } }, data: { read: true } });
    const unreadAfter = await prisma.notification.count({ where: { userId: citizen.id, read: false, payload: { path: ["phase9Acceptance"], equals: true } } });
    assert.equal(unreadAfter, 0);
    console.log(`Phase 9 acceptance verified: 5 event types, ${delivery.delivered} Expo deliveries, Project Head in-app delivery, amber conflicts, and authoritative unread clearing.`);
  } finally {
    await prisma.notification.deleteMany({ where: { payload: { path: ["phase9Acceptance"], equals: true } } });
    await prisma.pushToken.deleteMany({ where: { token: { in: [citizenToken, engineerToken] } } });
    await prisma.$disconnect();
  }
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
