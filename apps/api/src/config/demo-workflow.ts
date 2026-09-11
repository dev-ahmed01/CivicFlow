import { prisma, UserRole, type Prisma } from "db";
import { getEnv } from "./env";

export async function demoWorkflowEnabled(client: Prisma.TransactionClient = prisma): Promise<boolean> {
  if (getEnv().DEPLOYMENT_PROFILE === "production") return false;
  return (await client.systemConfig.findUnique({ where: { key: "demo.workflow_defaults_enabled" } }))?.value === true;
}

// Only absent/blank fields receive defaults. Invalid supplied values still fail Zod.
export function withDemoDefaults(body: unknown, defaults: Record<string, unknown>): Record<string, unknown> {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const result = { ...input };
  for (const [key, value] of Object.entries(defaults)) {
    if (result[key] === undefined || typeof result[key] === "string" && !String(result[key]).trim()) result[key] = value;
  }
  return result;
}

export async function demoEngineerId(agencyId: string): Promise<string | undefined> {
  return (await prisma.user.findFirst({ where: { agencyId, role: UserRole.ENGINEER, deactivatedAt: null, mustResetPassword: false }, orderBy: { id: "asc" }, select: { id: true } }))?.id;
}

export function demoDates() {
  return { plannedStart: new Date().toISOString(), plannedEnd: new Date(Date.now() + 2 * 86_400_000).toISOString() };
}

export async function demoIntervention(client: Prisma.TransactionClient, wardId: string, ticketId?: string) {
  // Delta §4.4: deterministic same-ward road selection; never create dependencies.
  const segments = await client.$queryRaw<Array<{ id: string; length: number }>>`
    SELECT s."id", ST_Length(s."geometry"::geography) AS "length"
    FROM "RoadSegment" s LEFT JOIN "Ticket" t ON t."id" = ${ticketId ?? null}::uuid
    WHERE s."wardId" = ${wardId}::uuid
    ORDER BY ST_Distance(s."geometry"::geography, t."coordinates"::geography) ASC NULLS LAST, s."id" ASC LIMIT 1
  `;
  const segment = segments[0];
  return segment ? { segmentId: segment.id, purpose: "resurfacing" as const, ...demoDates(), affectedLengthM: Math.min(25, segment.length), startOffsetM: 0, dependencyRefs: [] as string[] } : undefined;
}
