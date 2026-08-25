import { Prisma, UserRole, prisma, type PrismaClient } from "db";
import { notificationPresentation } from "@civicos/shared";

export type NotificationClient = Prisma.TransactionClient | PrismaClient;
export type NotificationInput = {
  userId: string;
  type: string;
  payload: Prisma.InputJsonValue;
};

export type ExpoPushMessage = {
  to: string;
  sound: "default";
  title: "CivicOS";
  body: string;
  data: Record<string, unknown>;
};

export type ExpoPushResult =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

export interface PushGateway {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushResult[]>;
}

export class ExpoPushGateway implements PushGateway {
  constructor(private readonly accessToken?: string) {}

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushResult[]> {
    if (messages.length === 0) return [];
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push gateway returned ${response.status}`);
    const body = await response.json() as { data?: ExpoPushResult | ExpoPushResult[] };
    const data = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    if (data.length !== messages.length) throw new Error("Expo push gateway returned an incomplete response");
    return data;
  }
}

export async function createNotifications(client: NotificationClient, inputs: NotificationInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const result = await client.notification.createMany({ data: inputs });
  return result.count;
}

export async function createNotification(client: NotificationClient, input: NotificationInput): Promise<void> {
  await createNotifications(client, [input]);
}

export function buildExpoPushMessage(input: {
  token: string;
  notification: { id: string; type: string; payload: Prisma.JsonValue };
}): ExpoPushMessage {
  const payload = input.notification.payload && typeof input.notification.payload === "object" && !Array.isArray(input.notification.payload)
    ? input.notification.payload as Record<string, unknown>
    : {};
  return {
    to: input.token,
    sound: "default",
    title: "CivicOS",
    body: notificationPresentation(input.notification.type).message,
    data: { notificationId: input.notification.id, type: input.notification.type, ...payload },
  };
}

// Part II §6 / Part III §16.6 — Notification rows are the transactional outbox.
// This retryable worker delivers mobile-role rows to every active Expo token.
export async function runPushDeliveryJob(
  gateway: PushGateway,
  now = new Date(),
): Promise<{ attempted: number; delivered: number; failed: number }> {
  const undispatched = await prisma.notification.findMany({
    where: {
      user: {
        role: { in: [UserRole.CITIZEN, UserRole.ENGINEER] },
        pushTokens: { some: { active: true } },
      },
      pushDeliveries: { none: {} },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      pushDeliveries: { select: { pushTokenId: true } },
      user: { select: { pushTokens: { where: { active: true }, select: { id: true } } } },
    },
  });
  const deliveryRows = undispatched.flatMap((notification) => {
    const existing = new Set(notification.pushDeliveries.map((item) => item.pushTokenId));
    return notification.user.pushTokens
      .filter((token) => !existing.has(token.id))
      .map((token) => ({ notificationId: notification.id, pushTokenId: token.id }));
  });
  if (deliveryRows.length > 0) {
    await prisma.notificationPushDelivery.createMany({ data: deliveryRows, skipDuplicates: true });
  }

  const deliveries = await prisma.notificationPushDelivery.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: 5 }, pushToken: { active: true } },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      notification: { select: { id: true, type: true, payload: true } },
      pushToken: { select: { id: true, token: true } },
    },
  });
  if (deliveries.length === 0) return { attempted: 0, delivered: 0, failed: 0 };

  const messages = deliveries.map((item) => buildExpoPushMessage({ token: item.pushToken.token, notification: item.notification }));
  let results: ExpoPushResult[];
  try {
    results = await gateway.send(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push delivery failed";
    await prisma.notificationPushDelivery.updateMany({
      where: { id: { in: deliveries.map((item) => item.id) } },
      data: { status: "FAILED", lastError: message.slice(0, 500), lastAttemptAt: now, attemptCount: { increment: 1 } },
    });
    return { attempted: deliveries.length, delivered: 0, failed: deliveries.length };
  }

  let delivered = 0;
  let failed = 0;
  await Promise.all(results.map(async (result, index) => {
    const delivery = deliveries[index]!;
    if (result.status === "ok") {
      delivered += 1;
      await prisma.notificationPushDelivery.update({
        where: { id: delivery.id },
        data: { status: "DELIVERED", receiptId: result.id, deliveredAt: now, lastAttemptAt: now, lastError: null, attemptCount: { increment: 1 } },
      });
      return;
    }
    failed += 1;
    if (result.details?.error === "DeviceNotRegistered") {
      await prisma.$transaction([
        prisma.pushToken.update({ where: { id: delivery.pushToken.id }, data: { active: false } }),
        prisma.notificationPushDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: result.message.slice(0, 500), lastAttemptAt: now, attemptCount: 5 } }),
      ]);
      return;
    }
    await prisma.notificationPushDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", lastError: result.message.slice(0, 500), lastAttemptAt: now, attemptCount: { increment: 1 } },
    });
  }));
  return { attempted: deliveries.length, delivered, failed };
}

export function startPushDeliveryScheduler(gateway: PushGateway, intervalSeconds: number): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void runPushDeliveryJob(gateway)
      .catch((error: unknown) => console.error("Push delivery job failed", error))
      .finally(() => { running = false; });
  };
  run();
  const timer = setInterval(run, intervalSeconds * 1000);
  timer.unref();
  return timer;
}
