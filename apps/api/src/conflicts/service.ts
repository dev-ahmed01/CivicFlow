import { createHash } from "node:crypto";
import { ConflictSeverity, Prisma, type PrismaClient, ProjectState, UserRole } from "db";
import type { ProjectConflict } from "@civicos/shared";
import { createNotifications } from "../notifications/service";

export type ConflictCheckClient = Prisma.TransactionClient | PrismaClient;

type ConflictCandidate = {
  sourceProjectId: string;
  sourceAgencyId: string;
  sourcePlannedStart: Date;
  sourcePlannedEnd: Date;
  sourceAddress: string | null;
  sourceWardName: string | null;
  sourceSegmentId: string | null;
  sourceRoadName: string | null;
  candidateProjectId: string;
  candidateAgencyId: string;
  candidateAgencyName: string;
  candidateProjectName: string;
  candidatePlannedStart: Date;
  candidatePlannedEnd: Date;
  candidateAddress: string | null;
  candidateWardName: string | null;
  candidateSegmentId: string | null;
  candidateRoadName: string | null;
  distanceMeters: number | null;
  sameWard: boolean;
  sameSegment: boolean;
};

function configuredRadius(value: Prisma.JsonValue | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("AdminConfig conflict.radius_meters must contain a positive number");
  }
  return value;
}

export function isFullDateOverlap(firstStart: Date, firstEnd: Date, secondStart: Date, secondEnd: Date): boolean {
  return (firstStart <= secondStart && firstEnd >= secondEnd)
    || (secondStart <= firstStart && secondEnd >= firstEnd);
}

export function conflictSeverity(candidate: Pick<ConflictCandidate, "sourcePlannedStart" | "sourcePlannedEnd" | "candidatePlannedStart" | "candidatePlannedEnd" | "distanceMeters">): ConflictSeverity {
  // Part III §13.3 — prominent means a complete containment overlap within 100m.
  const fullOverlap = isFullDateOverlap(
    candidate.sourcePlannedStart,
    candidate.sourcePlannedEnd,
    candidate.candidatePlannedStart,
    candidate.candidatePlannedEnd,
  );
  return fullOverlap && candidate.distanceMeters !== null && candidate.distanceMeters < 100
    ? ConflictSeverity.PROMINENT
    : ConflictSeverity.INLINE;
}

function timelineFingerprint(
  first: { id: string; start: Date; end: Date },
  second: { id: string; start: Date; end: Date },
): string {
  return createHash("sha256")
    .update([first.id, first.start.toISOString(), first.end.toISOString(), second.id, second.start.toISOString(), second.end.toISOString()].join("|"))
    .digest("hex");
}

function locationDescription(candidate: ConflictCandidate): string {
  if (candidate.sameSegment) {
    return [candidate.sourceRoadName ?? candidate.candidateRoadName, candidate.sourceWardName ?? candidate.candidateWardName]
      .filter(Boolean)
      .join(", ");
  }
  if (candidate.sameWard) return `${candidate.sourceWardName ?? candidate.candidateWardName ?? "Shared ward"} ward`;
  return candidate.sourceAddress ?? candidate.candidateAddress ?? "Nearby project locations";
}

function reasonFor(candidate: ConflictCandidate, severity: ConflictSeverity, radiusMeters: number): string {
  const geography = candidate.sameSegment
    ? "the same road segment"
    : candidate.sameWard
      ? "the same ward"
      : `${Math.round(candidate.distanceMeters ?? radiusMeters)}m apart`;
  const overlap = severity === ConflictSeverity.PROMINENT ? "fully overlapping dates" : "overlapping dates";
  return `${overlap} at ${geography}; advisory only`;
}

// Part III §13 — Phase 6 owns the transition wiring. This function detects and
// records advisory warnings while allowing the caller to activate the project.
export async function checkProjectConflicts(
  client: ConflictCheckClient,
  projectId: string,
): Promise<ProjectConflict[]> {
  const config = await client.adminConfig.findUnique({ where: { key: "conflict.radius_meters" }, select: { value: true } });
  const radiusMeters = configuredRadius(config?.value);
  const activeStates = [
    ProjectState.TIMELINE_SET,
    ProjectState.CONFLICT_CHECKED,
    ProjectState.ACTIVE,
    ProjectState.MODIFIED,
  ];

  // Part III §13.2 — PostGIS performs the configurable radius comparison. Ward
  // and segment equality are independent geographic matches.
  const candidates = await client.$queryRaw<ConflictCandidate[]>(Prisma.sql`
    WITH source AS (
      SELECT p."id", p."agencyId", p."plannedStart", p."plannedEnd",
        t."coordinates", t."address", t."wardId", w."name" AS "wardName",
        i."segmentId", rs."roadName"
      FROM "Project" p
      LEFT JOIN "Ticket" t ON t."id" = p."ticketId"
      LEFT JOIN "Ward" w ON w."id" = t."wardId"
      LEFT JOIN "Intervention" i ON i."projectId" = p."id"
      LEFT JOIN "RoadSegment" rs ON rs."id" = i."segmentId"
      WHERE p."id" = ${projectId}::uuid
        AND p."plannedStart" IS NOT NULL
        AND p."plannedEnd" IS NOT NULL
    )
    SELECT
      s."id" AS "sourceProjectId",
      s."agencyId" AS "sourceAgencyId",
      s."plannedStart" AS "sourcePlannedStart",
      s."plannedEnd" AS "sourcePlannedEnd",
      s."address" AS "sourceAddress",
      s."wardName" AS "sourceWardName",
      s."segmentId" AS "sourceSegmentId",
      s."roadName" AS "sourceRoadName",
      other."id" AS "candidateProjectId",
      other."agencyId" AS "candidateAgencyId",
      agency."name" AS "candidateAgencyName",
      COALESCE(other_ticket."title", CONCAT('Project ', LEFT(other."id"::text, 8))) AS "candidateProjectName",
      other."plannedStart" AS "candidatePlannedStart",
      other."plannedEnd" AS "candidatePlannedEnd",
      other_ticket."address" AS "candidateAddress",
      other_ward."name" AS "candidateWardName",
      other_intervention."segmentId" AS "candidateSegmentId",
      other_segment."roadName" AS "candidateRoadName",
      CASE WHEN s."coordinates" IS NOT NULL AND other_ticket."coordinates" IS NOT NULL
        THEN ST_Distance(s."coordinates"::geography, other_ticket."coordinates"::geography)
        ELSE NULL END AS "distanceMeters",
      COALESCE(s."wardId" = other_ticket."wardId", FALSE) AS "sameWard",
      COALESCE(s."segmentId" = other_intervention."segmentId", FALSE) AS "sameSegment"
    FROM source s
    JOIN "Project" other ON other."id" <> s."id"
    JOIN "Agency" agency ON agency."id" = other."agencyId"
    LEFT JOIN "Ticket" other_ticket ON other_ticket."id" = other."ticketId"
    LEFT JOIN "Ward" other_ward ON other_ward."id" = other_ticket."wardId"
    LEFT JOIN "Intervention" other_intervention ON other_intervention."projectId" = other."id"
    LEFT JOIN "RoadSegment" other_segment ON other_segment."id" = other_intervention."segmentId"
    WHERE other."state" IN (${Prisma.join(activeStates.map((state) => Prisma.sql`${state}::"ProjectState"`))})
      AND other."plannedStart" IS NOT NULL
      AND other."plannedEnd" IS NOT NULL
      AND other."plannedStart" <= s."plannedEnd"
      AND other."plannedEnd" >= s."plannedStart"
      AND (
        (s."coordinates" IS NOT NULL AND other_ticket."coordinates" IS NOT NULL
          AND ST_DWithin(s."coordinates"::geography, other_ticket."coordinates"::geography, ${radiusMeters}))
        OR (s."wardId" IS NOT NULL AND s."wardId" = other_ticket."wardId")
        OR (s."segmentId" IS NOT NULL AND s."segmentId" = other_intervention."segmentId")
      )
    ORDER BY other."plannedStart", other."id"
  `);

  return Promise.all(candidates.map(async (candidate) => {
    const sourceFirst = candidate.sourceProjectId.localeCompare(candidate.candidateProjectId) < 0;
    const first = sourceFirst
      ? { id: candidate.sourceProjectId, agencyId: candidate.sourceAgencyId, start: candidate.sourcePlannedStart, end: candidate.sourcePlannedEnd }
      : { id: candidate.candidateProjectId, agencyId: candidate.candidateAgencyId, start: candidate.candidatePlannedStart, end: candidate.candidatePlannedEnd };
    const second = sourceFirst
      ? { id: candidate.candidateProjectId, agencyId: candidate.candidateAgencyId, start: candidate.candidatePlannedStart, end: candidate.candidatePlannedEnd }
      : { id: candidate.sourceProjectId, agencyId: candidate.sourceAgencyId, start: candidate.sourcePlannedStart, end: candidate.sourcePlannedEnd };
    const severity = conflictSeverity(candidate);
    const overlapStart = new Date(Math.max(candidate.sourcePlannedStart.getTime(), candidate.candidatePlannedStart.getTime()));
    const overlapEnd = new Date(Math.min(candidate.sourcePlannedEnd.getTime(), candidate.candidatePlannedEnd.getTime()));
    const description = locationDescription(candidate);
    const fingerprint = timelineFingerprint(first, second);
    const existing = await client.conflictLog.findUnique({
      where: { projectId_conflictingProjectId_timelineFingerprint: {
        projectId: first.id,
        conflictingProjectId: second.id,
        timelineFingerprint: fingerprint,
      } },
      select: { id: true },
    });
    const log = await client.conflictLog.upsert({
      where: { projectId_conflictingProjectId_timelineFingerprint: {
        projectId: first.id,
        conflictingProjectId: second.id,
        timelineFingerprint: fingerprint,
      } },
      update: {
        overlapStart,
        overlapEnd,
        locationDescription: description,
        distanceMeters: candidate.distanceMeters,
        severity,
      },
      create: {
        projectId: first.id,
        conflictingProjectId: second.id,
        projectAgencyId: first.agencyId,
        conflictingAgencyId: second.agencyId,
        projectTimelineStart: first.start,
        projectTimelineEnd: first.end,
        conflictingTimelineStart: second.start,
        conflictingTimelineEnd: second.end,
        overlapStart,
        overlapEnd,
        locationDescription: description,
        distanceMeters: candidate.distanceMeters,
        severity,
        timelineFingerprint: fingerprint,
      },
      select: { id: true, createdAt: true },
    });
    if (!existing) {
      const projects = await client.project.findMany({
        where: { id: { in: [first.id, second.id] } },
        select: { engineerId: true },
      });
      const engineerIds = projects.flatMap((project) => project.engineerId ? [project.engineerId] : []);
      const users = await client.user.findMany({
        where: { OR: [
          { agencyId: { in: [first.agencyId, second.agencyId] }, role: UserRole.PROJECT_HEAD },
          ...(engineerIds.length ? [{ id: { in: engineerIds }, role: UserRole.ENGINEER }] : []),
        ] },
        select: { id: true, agencyId: true },
      });
      await createNotifications(client, users.map((user) => ({
        userId: user.id,
        type: "CONFLICT_DETECTED",
        payload: {
          conflictId: log.id,
          projectId: user.agencyId === first.agencyId ? first.id : second.id,
          conflictingProjectId: user.agencyId === first.agencyId ? second.id : first.id,
          severity,
          advisory: true,
        },
      })));
    }

    return {
      id: log.id,
      projectId: candidate.sourceProjectId,
      conflictingProjectId: candidate.candidateProjectId,
      conflictingProjectName: candidate.candidateProjectName,
      conflictingAgency: { id: candidate.candidateAgencyId, name: candidate.candidateAgencyName },
      overlapStart,
      overlapEnd,
      locationDescription: description,
      distanceMeters: candidate.distanceMeters,
      severity,
      reason: reasonFor(candidate, severity, radiusMeters),
      detectedAt: log.createdAt,
    } satisfies ProjectConflict;
  }));
}
