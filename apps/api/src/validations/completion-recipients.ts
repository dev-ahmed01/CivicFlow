import { type Prisma, UserRole } from "db";
import { validationQuorum } from "./service";

// Part III §9.2 / §11: independent, active, phone-verified citizens only.
// Counted validators remain primary; nearby citizens fill missing quorum capacity.
export async function completionRecipients(client: Prisma.TransactionClient, ticketId: string, now = new Date()) {
  const ticket = await client.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { reporterId: true, ward: { select: { verificationRadiusOverrideMeters: true } } } });
  const previous = await client.validation.findMany({
    where: { ticketId, counted: true, validator: { role: UserRole.CITIZEN, deactivatedAt: null, phoneVerifiedAt: { not: null }, ...(ticket.reporterId ? { id: { not: ticket.reporterId } } : {}) } },
    distinct: ["validatorId"], select: { validatorId: true }, orderBy: { validatorId: "asc" },
  });
  const quorum = await validationQuorum(client);
  const ids = new Set(previous.map(({ validatorId }) => validatorId));
  if (ids.size >= quorum) return { ids: [...ids], quorum };
  const configs = await client.systemConfig.findMany({ where: { key: { in: ["verification.default_radius_meters", "verification.daily_cap", "verification.initial_recipient_count"] } } });
  const number = (key: string) => {
    const value = configs.find((item) => item.key === key)?.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Missing positive SystemConfig ${key}`);
    return value;
  };
  const radius = ticket.ward.verificationRadiusOverrideMeters ?? number("verification.default_radius_meters");
  const cap = number("verification.daily_cap");
  const limit = Math.max(quorum, number("verification.initial_recipient_count"));
  const nearby = await client.$queryRaw<Array<{ citizenId: string }>>`
    SELECT u."id" AS "citizenId" FROM "User" u JOIN "Ticket" t ON t."id" = ${ticketId}::uuid
    WHERE u."role" = 'CITIZEN' AND u."phoneVerifiedAt" IS NOT NULL AND u."deactivatedAt" IS NULL
      AND u."id" <> COALESCE(t."reporterId", '00000000-0000-0000-0000-000000000000'::uuid)
      AND u."lastKnownCoordinates" IS NOT NULL
      AND ST_DWithin(u."lastKnownCoordinates"::geography, t."coordinates"::geography, ${radius})
      AND (SELECT COUNT(*) FROM "Validation" v WHERE v."validatorId" = u."id"
        AND v."createdAt" >= date_trunc('day', ${now}::timestamp)
        AND v."createdAt" < date_trunc('day', ${now}::timestamp) + INTERVAL '1 day') < ${cap}
    ORDER BY ST_Distance(u."lastKnownCoordinates"::geography, t."coordinates"::geography), u."id" LIMIT ${limit}
  `;
  for (const { citizenId } of nearby) ids.add(citizenId);
  return { ids: [...ids], quorum };
}
