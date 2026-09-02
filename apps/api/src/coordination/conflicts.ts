import { Prisma, type PrismaClient } from "db";
import type { CoordinationConflict } from "@civicos/shared";
import { readCivicWorkGeometries } from "../civic-works/repository";

type Client = Prisma.TransactionClient | PrismaClient;

const workSelect = {
  id: true,
  referenceNumber: true,
  title: true,
  plannedStart: true,
  plannedEnd: true,
  agency: { select: { id: true, name: true } },
  intervention: { select: { startOffsetM: true, affectedLengthM: true } },
} satisfies Prisma.ProjectSelect;

const coordinationSelect = {
  id: true,
  dependencyId: true,
  status: true,
} satisfies Prisma.CoordinationRequestSelect;

type Work = Prisma.ProjectGetPayload<{ select: typeof workSelect }>;

function temporalRelationship(first: Work, second: Work): string {
  if (!first.plannedStart || !first.plannedEnd || !second.plannedStart || !second.plannedEnd) return "One or both proposed execution windows are incomplete.";
  const overlapStart = new Date(Math.max(first.plannedStart.getTime(), second.plannedStart.getTime()));
  const overlapEnd = new Date(Math.min(first.plannedEnd.getTime(), second.plannedEnd.getTime()));
  if (overlapStart <= overlapEnd) {
    return `Proposed execution windows overlap from ${overlapStart.toISOString().slice(0, 10)} to ${overlapEnd.toISOString().slice(0, 10)}.`;
  }
  const firstBeforeSecond = first.plannedEnd < second.plannedStart;
  const earlier = firstBeforeSecond ? first : second;
  const later = firstBeforeSecond ? second : first;
  return `${earlier.title} is planned to finish before ${later.title} begins.`;
}

function sourcePair(projectId: string, first: Work, second: Work): { source: Work; conflicting: Work } {
  return first.id === projectId ? { source: first, conflicting: second } : { source: second, conflicting: first };
}

export async function coordinationConflictsForProject(client: Client, projectId: string): Promise<CoordinationConflict[]> {
  const [generic, road] = await Promise.all([
    client.conflictLog.findMany({
      where: { OR: [{ projectId }, { conflictingProjectId: projectId }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        project: { select: workSelect },
        conflictingProject: { select: workSelect },
        coordinationRequests: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: coordinationSelect },
      },
    }),
    client.roadConflictLog.findMany({
      where: { conflictingProjectId: { not: null }, OR: [{ projectId }, { conflictingProjectId: projectId }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        project: { select: workSelect },
        conflictingProject: { select: workSelect },
        segment: { select: { roadName: true } },
        coordinationRequests: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: coordinationSelect },
      },
    }),
  ]);
  const opposingProjectIds = [...new Set([
    ...generic.flatMap((item) => [item.projectId, item.conflictingProjectId]),
    ...road.flatMap((item) => [item.projectId, item.conflictingProjectId]).filter((id): id is string => Boolean(id)),
  ].filter((id) => id !== projectId))];
  const pairRequests = opposingProjectIds.length === 0 ? [] : await client.coordinationRequest.findMany({
    where: { OR: [
      { projectId, conflictingProjectId: { in: opposingProjectIds } },
      { projectId: { in: opposingProjectIds }, conflictingProjectId: projectId },
    ] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { ...coordinationSelect, projectId: true, conflictingProjectId: true },
  });
  const latestByOpposingProject = new Map<string, typeof pairRequests[number]>();
  for (const request of pairRequests) {
    const opposingId = request.projectId === projectId ? request.conflictingProjectId : request.projectId;
    if (opposingId && !latestByOpposingProject.has(opposingId)) latestByOpposingProject.set(opposingId, request);
  }

  const genericItems = generic.map((item) => {
    const pair = sourcePair(projectId, item.project, item.conflictingProject);
    const latest = item.coordinationRequests[0] ?? latestByOpposingProject.get(pair.conflicting.id);
    return {
      id: item.id,
      kind: "PROJECT" as const,
      sourceWork: pair.source,
      conflictingWork: pair.conflicting,
      locationDescription: item.locationDescription,
      temporalRelationship: temporalRelationship(pair.source, pair.conflicting),
      reason: `These works share or closely overlap ${item.locationDescription}, and their proposed execution windows overlap.`,
      severity: item.severity,
      roadConflictType: null,
      overlapLengthM: null,
      advisory: true as const,
      detectedAt: item.createdAt,
      coordination: latest ? { requestId: latest.id, dependencyId: latest.dependencyId, status: latest.status } : null,
    } satisfies CoordinationConflict;
  });
  const roadItems = road.flatMap((item) => {
    if (!item.conflictingProject) return [];
    const pair = sourcePair(projectId, item.project, item.conflictingProject);
    const latest = item.coordinationRequests[0] ?? latestByOpposingProject.get(pair.conflicting.id);
    return [{
      id: item.id,
      kind: "ROAD" as const,
      sourceWork: pair.source,
      conflictingWork: pair.conflicting,
      locationDescription: item.segment.roadName,
      temporalRelationship: temporalRelationship(pair.source, pair.conflicting),
      reason: item.reason.replace(/[;.]?\s*advisory only\.?$/i, "."),
      severity: item.severity,
      roadConflictType: item.type,
      overlapLengthM: pair.source.intervention && pair.conflicting.intervention
        ? Math.max(0, Math.min(pair.source.intervention.startOffsetM + pair.source.intervention.affectedLengthM, pair.conflicting.intervention.startOffsetM + pair.conflicting.intervention.affectedLengthM) - Math.max(pair.source.intervention.startOffsetM, pair.conflicting.intervention.startOffsetM))
        : null,
      advisory: true as const,
      detectedAt: item.createdAt,
      coordination: latest ? { requestId: latest.id, dependencyId: latest.dependencyId, status: latest.status } : null,
    } satisfies CoordinationConflict];
  });
  const items = [...genericItems, ...roadItems];
  const geometries = await readCivicWorkGeometries(client, [...new Set(items.flatMap((item) => [item.sourceWork.id, item.conflictingWork.id]))]);
  return items.map((item) => ({
    ...item,
    sourceWork: { ...item.sourceWork, geometry: geometries.get(item.sourceWork.id) ?? null },
    conflictingWork: { ...item.conflictingWork, geometry: geometries.get(item.conflictingWork.id) ?? null },
  })).sort((first, second) => second.detectedAt.getTime() - first.detectedAt.getTime());
}
