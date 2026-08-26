import { Prisma, TicketState, UserRole, prisma } from "db";
import { routeValidatedTicket } from "../routing/service";
import { createNotifications } from "../notifications/service";

const requestType = "VALIDATION_REQUEST";

type DatabaseClient = Prisma.TransactionClient;

type Candidate = {
  citizenId: string;
  distanceMeters: number;
};

type LockedTicket = {
  id: string;
  state: TicketState;
  reporterId: string | null;
};

export type ValidationSubmission = {
  validationId: string;
  counted: boolean;
  alreadyResolved: boolean;
  state: TicketState;
};

function positiveConfigNumber(value: Prisma.JsonValue, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AdminConfig ${key} must contain a positive number`);
  }
  return value;
}

async function configNumber(client: DatabaseClient, key: string): Promise<number> {
  const config = await client.adminConfig.findUnique({ where: { key } });
  if (!config) throw new Error(`Missing required AdminConfig ${key}`);
  return positiveConfigNumber(config.value, key);
}

async function createBatch(client: DatabaseClient, ticketId: string, now: Date): Promise<number> {
  const ticket = await client.ticket.findUnique({
    where: { id: ticketId },
    select: {
      reporterId: true,
      state: true,
      ward: { select: { verificationRadiusOverrideMeters: true } },
    },
  });
  if (!ticket || ticket.state !== TicketState.PENDING_VALIDATION) return 0;

  const [defaultRadius, dailyCap, recipientCount, responseHours, latestBatch] = await Promise.all([
    configNumber(client, "verification.default_radius_meters"),
    configNumber(client, "verification.daily_cap"),
    configNumber(client, "verification.initial_recipient_count"),
    configNumber(client, "verification.renotify_after_hours"),
    client.validationRequest.aggregate({ where: { ticketId }, _max: { batchNumber: true } }),
  ]);
  const radiusMeters = ticket.ward.verificationRadiusOverrideMeters ?? defaultRadius;
  const batchNumber = (latestBatch._max.batchNumber ?? 0) + 1;

  // Part III §9.2–§9.3 — PostGIS is authoritative and every eligibility rule is
  // applied before proximity ordering. Prior batches are permanently excluded.
  const candidates = await client.$queryRaw<Candidate[]>`
    SELECT u."id" AS "citizenId",
      ST_Distance(u."lastKnownCoordinates"::geography, t."coordinates"::geography) AS "distanceMeters"
    FROM "User" u
    JOIN "Ticket" t ON t."id" = ${ticketId}::uuid
    WHERE u."role" = ${UserRole.CITIZEN}::"UserRole"
      AND u."lastKnownCoordinates" IS NOT NULL
      AND u."phoneVerifiedAt" IS NOT NULL
      AND u."id" <> COALESCE(t."reporterId", '00000000-0000-0000-0000-000000000000'::uuid)
      AND ST_DWithin(u."lastKnownCoordinates"::geography, t."coordinates"::geography, ${radiusMeters})
      AND NOT EXISTS (
        SELECT 1 FROM "Validation" v
        WHERE v."ticketId" = t."id" AND v."validatorId" = u."id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "ValidationRequest" vr
        WHERE vr."ticketId" = t."id" AND vr."citizenId" = u."id"
      )
      AND (
        SELECT COUNT(*) FROM "Validation" daily
        WHERE daily."validatorId" = u."id"
          AND daily."createdAt" >= date_trunc('day', ${now}::timestamp)
          AND daily."createdAt" < date_trunc('day', ${now}::timestamp) + INTERVAL '1 day'
      ) < ${dailyCap}
    ORDER BY "distanceMeters" ASC, u."id" ASC
    LIMIT ${recipientCount}
  `;
  if (candidates.length === 0) return 0;

  const expiresAt = new Date(now.getTime() + responseHours * 60 * 60 * 1000);
  await client.validationRequest.createMany({
    data: candidates.map((candidate) => ({
      ticketId,
      citizenId: candidate.citizenId,
      batchNumber,
      distanceMeters: candidate.distanceMeters,
      notifiedAt: now,
      expiresAt,
    })),
  });
  await createNotifications(client, candidates.map((candidate) => ({
      userId: candidate.citizenId,
      type: requestType,
      payload: {
        ticketId,
        batchNumber,
        distanceMeters: Math.round(candidate.distanceMeters),
        expiresAt: expiresAt.toISOString(),
      },
    })));
  return candidates.length;
}

export async function enterPendingValidation(
  client: DatabaseClient,
  ticketId: string,
  fromState: TicketState,
  now = new Date(),
  actedById?: string,
): Promise<number> {
  const transitioned = await client.ticket.updateMany({
    where: { id: ticketId, state: fromState },
    data: { state: TicketState.PENDING_VALIDATION },
  });
  if (transitioned.count === 0) return 0;
  await client.ticketStateTransition.create({
    data: {
      ticketId,
      fromState,
      toState: TicketState.PENDING_VALIDATION,
      reason: "RELEVANCE_CHECK_COMPLETE",
      actedById,
    },
  });
  return createBatch(client, ticketId, now);
}

export async function submitValidation(
  ticketId: string,
  citizenId: string,
  vote: "CONFIRM" | "NOT_SURE" | "REJECT",
  now = new Date(),
): Promise<ValidationSubmission | null> {
  return prisma.$transaction(async (transaction) => {
    // Part III §9 — the ticket row lock serializes competing quorum submissions.
    const rows = await transaction.$queryRaw<LockedTicket[]>`
      SELECT "id", "state", "reporterId"
      FROM "Ticket"
      WHERE "id" = ${ticketId}::uuid
      FOR UPDATE
    `;
    const ticket = rows[0];
    if (!ticket) return null;

    const invitation = await transaction.validationRequest.findUnique({
      where: { ticketId_citizenId: { ticketId, citizenId } },
      select: { id: true },
    });
    if (!invitation || ticket.reporterId === citizenId) return null;

    const existing = await transaction.validation.findUnique({
      where: { ticketId_validatorId: { ticketId, validatorId: citizenId } },
    });
    if (existing) {
      return {
        validationId: existing.id,
        counted: existing.counted,
        alreadyResolved: !existing.counted || ticket.state !== TicketState.PENDING_VALIDATION,
        state: ticket.state,
      };
    }

    const alreadyResolved = ticket.state !== TicketState.PENDING_VALIDATION;
    if (!alreadyResolved) {
      const [dailyCap, citizen] = await Promise.all([
        configNumber(transaction, "verification.daily_cap"),
        transaction.user.findUnique({ where: { id: citizenId }, select: { phoneVerifiedAt: true } }),
      ]);
      if (!citizen?.phoneVerifiedAt) return null;
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dailyCount = await transaction.validation.count({
        where: { validatorId: citizenId, createdAt: { gte: dayStart, lt: dayEnd } },
      });
      if (dailyCount >= dailyCap) {
        throw new ValidationDailyCapError();
      }
    }

    const validation = await transaction.validation.create({
      data: { ticketId, validatorId: citizenId, vote, counted: !alreadyResolved, createdAt: now },
    });
    await transaction.validationRequest.update({ where: { id: invitation.id }, data: { respondedAt: now } });

    if (alreadyResolved) {
      return { validationId: validation.id, counted: false, alreadyResolved: true, state: ticket.state };
    }

    const quorum = await configNumber(transaction, "verification.quorum");
    const counted = await transaction.validation.count({ where: { ticketId, counted: true } });
    if (counted < quorum) {
      return { validationId: validation.id, counted: true, alreadyResolved: false, state: ticket.state };
    }

    // Part III §§7, 10.2–10.3 — validation and table-driven assignment commit
    // atomically, so an agency queue never observes a half-routed ticket.
    await routeValidatedTicket(transaction, ticketId, citizenId);
    return { validationId: validation.id, counted: true, alreadyResolved: false, state: TicketState.ROUTED_TO_AGENCY };
  });
}

export async function runValidationRebatchJob(now = new Date()): Promise<{ ticketsProcessed: number; notificationsCreated: number }> {
  const due = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT t."id"
    FROM "Ticket" t
    WHERE t."state" = ${TicketState.PENDING_VALIDATION}::"TicketState"
      AND EXISTS (SELECT 1 FROM "ValidationRequest" vr WHERE vr."ticketId" = t."id")
      AND (SELECT MAX(vr."expiresAt") FROM "ValidationRequest" vr WHERE vr."ticketId" = t."id") <= ${now}
    ORDER BY t."createdAt" ASC
    LIMIT 50
  `;
  let ticketsProcessed = 0;
  let notificationsCreated = 0;
  for (const ticket of due) {
    const created = await prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ state: TicketState }>>`
        SELECT "state" FROM "Ticket" WHERE "id" = ${ticket.id}::uuid FOR UPDATE
      `;
      if (locked[0]?.state !== TicketState.PENDING_VALIDATION) return 0;
      const latest = await transaction.validationRequest.aggregate({ where: { ticketId: ticket.id }, _max: { expiresAt: true } });
      if (!latest._max.expiresAt || latest._max.expiresAt > now) return 0;
      const quorum = await configNumber(transaction, "verification.quorum");
      const count = await transaction.validation.count({ where: { ticketId: ticket.id, counted: true } });
      if (count >= quorum) return 0;
      return createBatch(transaction, ticket.id, now);
    });
    if (created > 0) {
      ticketsProcessed += 1;
      notificationsCreated += created;
    }
  }
  return { ticketsProcessed, notificationsCreated };
}

export class ValidationDailyCapError extends Error {
  constructor() {
    super("Daily validation limit reached");
    this.name = "ValidationDailyCapError";
  }
}

export function startValidationRebatchScheduler(intervalMinutes: number): NodeJS.Timeout {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void runValidationRebatchJob()
      .catch((error: unknown) => console.error("Validation rebatch job failed", error))
      .finally(() => { running = false; });
  };
  run();
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref();
  return timer;
}
