import { createHash } from "node:crypto";
import {
  Prisma,
  ProjectState,
  RoadConflictSeverity,
  RoadConflictType,
  UserRole,
  type PrismaClient,
} from "db";
import type {
  RoadConflict,
  SequencingOrderItem,
  SequencingRecommendation,
} from "@civicos/shared";
import { createNotifications } from "../notifications/service";

export type RoadIntelligenceClient = Prisma.TransactionClient | PrismaClient;

export type RoadInterventionRecord = {
  id: string;
  projectId: string;
  segmentId: string;
  agencyId: string;
  agencyName: string;
  purpose: string;
  plannedStart: Date;
  plannedEnd: Date;
  affectedLengthM: number;
  startOffsetM: number;
  dependencyRefs: string[];
  createdAt: Date;
  projectState: ProjectState;
  hasUnresolvedDependencies: boolean;
};

export type DetectedRoadConflict = {
  projectId: string;
  conflictingProjectId: string | null;
  segmentId: string;
  projectAgencyId: string;
  conflictingAgencyId: string | null;
  type: RoadConflictType;
  severity: RoadConflictSeverity;
  reason: string;
  fingerprint: string;
};

type RuleTrace = { rule: number; reason: string; projectIds: string[] };
type RecommendationDraft = {
  segmentId: string;
  projectIds: string[];
  proposedOrder: SequencingOrderItem[];
  explanation: string;
  ruleTrace: RuleTrace[];
  fingerprint: string;
};

const utilityPurposes = new Set(["pipeline", "cable", "ofc"]);
const terminalStates = new Set<ProjectState>([ProjectState.COMPLETED, ProjectState.AWAITING_VERIFICATION, ProjectState.CLOSED, ProjectState.CANCELLED]);

function hash(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function configuredPositiveNumber(value: Prisma.JsonValue | undefined, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AdminConfig ${key} must contain a positive number`);
  }
  return value;
}

function configuredString(value: Prisma.JsonValue | undefined, key: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`AdminConfig ${key} must contain a string`);
  }
  return value;
}

function datesOverlap(first: RoadInterventionRecord, second: RoadInterventionRecord): boolean {
  return first.plannedStart <= second.plannedEnd && first.plannedEnd >= second.plannedStart;
}

function rangesOverlap(first: RoadInterventionRecord, second: RoadInterventionRecord): boolean {
  const firstEnd = first.startOffsetM + first.affectedLengthM;
  const secondEnd = second.startOffsetM + second.affectedLengthM;
  return first.startOffsetM <= secondEnd && firstEnd >= second.startOffsetM;
}

function conflict(
  source: RoadInterventionRecord,
  candidate: RoadInterventionRecord | null,
  type: RoadConflictType,
  severity: RoadConflictSeverity,
  reason: string,
  extra: unknown[] = [],
): DetectedRoadConflict {
  return {
    projectId: source.projectId,
    conflictingProjectId: candidate?.projectId ?? null,
    segmentId: source.segmentId,
    projectAgencyId: source.agencyId,
    conflictingAgencyId: candidate?.agencyId ?? null,
    type,
    severity,
    reason,
    fingerprint: hash([
      type,
      source.projectId,
      source.plannedStart.toISOString(),
      source.plannedEnd.toISOString(),
      candidate?.projectId,
      candidate?.plannedStart.toISOString(),
      candidate?.plannedEnd.toISOString(),
      ...extra,
    ]),
  };
}

// Delta §4.3 — six road checks are deterministic, exact-segment, and advisory.
export function evaluateRoadConflicts(
  sourceProjectId: string,
  interventions: RoadInterventionRecord[],
  lastRestorationDate: Date | null,
  repeatedExcavationDays: number,
): DetectedRoadConflict[] {
  const source = interventions.find((item) => item.projectId === sourceProjectId);
  if (!source) return [];
  const detected: DetectedRoadConflict[] = [];
  const candidates = interventions.filter((item) => item.projectId !== source.projectId);

  for (const candidate of candidates) {
    if (rangesOverlap(source, candidate)) {
      detected.push(conflict(source, candidate, RoadConflictType.SPATIAL, RoadConflictSeverity.HIGH,
        `${source.agencyName} ${source.purpose} and ${candidate.agencyName} ${candidate.purpose} overlap on the exact road-segment chainage; advisory only.`));
    }
    if (datesOverlap(source, candidate)) {
      detected.push(conflict(source, candidate, RoadConflictType.TEMPORAL, RoadConflictSeverity.MEDIUM_HIGH,
        `${source.agencyName} and ${candidate.agencyName} have intersecting intervention dates on this segment; advisory only.`));
    }
    if (source.agencyId === candidate.agencyId && datesOverlap(source, candidate)
      && source.purpose.toLowerCase() === candidate.purpose.toLowerCase()) {
      detected.push(conflict(source, candidate, RoadConflictType.DUPLICATE_INTERVENTION, RoadConflictSeverity.MEDIUM,
        `Possible duplicate ${source.purpose} intervention by ${source.agencyName}; route to the Project Head for manual review and never auto-merge.`));
    }
  }

  for (const dependent of interventions.filter((item) => item.projectId === source.projectId || item.dependencyRefs.includes(source.id))) {
    for (const dependencyId of dependent.dependencyRefs) {
      const dependency = interventions.find((item) => item.id === dependencyId);
      if (!dependency || terminalStates.has(dependency.projectState)) continue;
      if (dependent.plannedStart < dependency.plannedEnd || !terminalStates.has(dependency.projectState)) {
        const primary = dependent.projectId === source.projectId ? dependent : source;
        const other = dependent.projectId === source.projectId ? dependency : dependent;
        detected.push(conflict(primary, other, RoadConflictType.SEQUENCING_VIOLATION, RoadConflictSeverity.HIGH,
          `${dependent.agencyName} ${dependent.purpose} starts before declared dependency ${dependency.agencyName} ${dependency.purpose} reaches WORK_COMPLETED; advisory only.`, [dependency.id]));
      }
    }
  }

  const sourceIsRestoration = source.purpose.toLowerCase() === "resurfacing";
  const restorations = sourceIsRestoration ? [source] : candidates.filter((item) => item.purpose.toLowerCase() === "resurfacing");
  const utilities = interventions.filter((item) => utilityPurposes.has(item.purpose.toLowerCase()));
  for (const restoration of restorations) {
    for (const utility of utilities) {
      if (restoration.projectId === utility.projectId || terminalStates.has(utility.projectState)) continue;
      if (source.projectId !== restoration.projectId && source.projectId !== utility.projectId) continue;
      const primary = source;
      const other = source.projectId === restoration.projectId ? utility : restoration;
      detected.push(conflict(primary, other, RoadConflictType.RESTORATION_TOO_EARLY, RoadConflictSeverity.HIGH,
        `${restoration.agencyName} resurfacing is planned before ${utility.agencyName} ${utility.purpose} is WORK_COMPLETED${utility.hasUnresolvedDependencies ? " and its dependencies are resolved" : ""}; resurfacing now risks re-cutting. Advisory only.`));
    }
  }

  if (lastRestorationDate) {
    const elapsedDays = (source.plannedStart.getTime() - lastRestorationDate.getTime()) / 86_400_000;
    if (elapsedDays >= 0 && elapsedDays <= repeatedExcavationDays) {
      detected.push(conflict(source, null, RoadConflictType.REPEATED_EXCAVATION_RISK, RoadConflictSeverity.MEDIUM,
        `This segment was restored ${Math.floor(elapsedDays)} days before the planned intervention, within the configured ${repeatedExcavationDays}-day risk window; advisory only.`, [lastRestorationDate.toISOString(), repeatedExcavationDays]));
    }
  }

  return detected.filter((item, index, all) => all.findIndex((candidate) => candidate.type === item.type
    && candidate.conflictingProjectId === item.conflictingProjectId
    && candidate.fingerprint === item.fingerprint) === index);
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dependencyOrderedUtilities(items: RoadInterventionRecord[]): RoadInterventionRecord[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: RoadInterventionRecord[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (item: RoadInterventionRecord) => {
    if (visited.has(item.id) || visiting.has(item.id)) return;
    visiting.add(item.id);
    for (const ref of item.dependencyRefs) {
      const dependency = byId.get(ref);
      if (dependency) visit(dependency);
    }
    visiting.delete(item.id);
    visited.add(item.id);
    result.push(item);
  };
  [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).forEach(visit);
  return result;
}

// Delta §4.4 — traceable rules, never a model-generated order.
export function buildSequencingRecommendation(interventions: RoadInterventionRecord[]): RecommendationDraft | null {
  const relevant = interventions.filter((item) => item.projectState !== ProjectState.CANCELLED);
  const utilities = dependencyOrderedUtilities(relevant.filter((item) => utilityPurposes.has(item.purpose.toLowerCase())));
  const restorations = relevant.filter((item) => item.purpose.toLowerCase() === "resurfacing")
    .sort((a, b) => a.plannedStart.getTime() - b.plannedStart.getTime());
  if (utilities.length === 0 || restorations.length === 0) return null;

  const projectIds = relevant.map((item) => item.projectId).sort();
  const utilityOrder: SequencingOrderItem[] = utilities.map((item) => ({
    projectId: item.projectId,
    interventionId: item.id,
    agencyName: item.agencyName,
    purpose: item.purpose,
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
    synthetic: false,
  }));
  const finalUtilityEnd = new Date(Math.max(...utilities.map((item) => item.plannedEnd.getTime())));
  const consolidated: SequencingOrderItem = {
    projectId: null,
    interventionId: null,
    agencyName: "Coordinating road authority",
    purpose: "consolidated restoration",
    plannedStart: finalUtilityEnd,
    plannedEnd: finalUtilityEnd,
    synthetic: true,
  };
  const restorationOrder: SequencingOrderItem[] = restorations.map((item) => ({
    projectId: item.projectId,
    interventionId: item.id,
    agencyName: item.agencyName,
    purpose: item.purpose,
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
    synthetic: false,
  }));
  const proposedOrder = [...utilityOrder, consolidated, ...restorationOrder];
  const work = relevant.map((item) => `${item.agencyName} ${item.purpose}`).join(", ");
  const orderText = proposedOrder.map((item) => `${item.agencyName} ${item.purpose} (${isoDay(item.plannedStart)}–${isoDay(item.plannedEnd)})`).join(" → ");
  const explanation = `${work} conflict on this road segment: resurfacing before utility work completes will likely require re-cutting. Recommended order: ${orderText}.`;
  const ruleTrace: RuleTrace[] = [
    { rule: 1, reason: "Included overlapping or completion-dependent interventions on the exact segment.", projectIds },
    { rule: 2, reason: "Placed pipeline, cable, and OFC utility work before resurfacing.", projectIds: utilities.map((item) => item.projectId) },
    { rule: 3, reason: "Ordered utility work by declared dependencies, then request time.", projectIds: utilities.map((item) => item.projectId) },
    { rule: 4, reason: "Placed one consolidated restoration after all utility work reaches WORK_COMPLETED.", projectIds: utilities.map((item) => item.projectId) },
    { rule: 5, reason: "Generated the agency/work problem statement and dated recommended order.", projectIds },
    { rule: 6, reason: "Attached this machine-readable rule trace for explainability.", projectIds },
  ];
  return {
    segmentId: relevant[0]!.segmentId,
    projectIds,
    proposedOrder,
    explanation,
    ruleTrace,
    fingerprint: hash(relevant.map((item) => [item.id, item.projectState, item.plannedStart.toISOString(), item.plannedEnd.toISOString(), item.dependencyRefs]).sort()),
  };
}

async function roadConfig(client: RoadIntelligenceClient): Promise<{ categoryId: string; repeatedDays: number }> {
  const [category, repeated] = await Promise.all([
    client.adminConfig.findUnique({ where: { key: "road.category_id" }, select: { value: true } }),
    client.adminConfig.findUnique({ where: { key: "road.repeated_excavation_days" }, select: { value: true } }),
  ]);
  return {
    categoryId: configuredString(category?.value, "road.category_id"),
    repeatedDays: configuredPositiveNumber(repeated?.value, "road.repeated_excavation_days"),
  };
}

async function segmentRecords(client: RoadIntelligenceClient, segmentId: string, categoryId: string): Promise<RoadInterventionRecord[]> {
  const records = await client.intervention.findMany({
    where: { segmentId, project: { categoryId } },
    include: {
      requestingAgency: { select: { id: true, name: true } },
      project: {
        select: {
          state: true,
          dependencies: { where: { state: { not: "FULFILLED" } }, select: { id: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return records.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    segmentId: item.segmentId,
    agencyId: item.requestingAgencyId,
    agencyName: item.requestingAgency.name,
    purpose: item.purpose,
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
    affectedLengthM: item.affectedLengthM,
    startOffsetM: item.startOffsetM,
    dependencyRefs: jsonStringArray(item.dependencyRefs),
    createdAt: item.createdAt,
    projectState: item.project.state,
    hasUnresolvedDependencies: item.project.dependencies.length > 0,
  }));
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function checkRoadConflicts(client: RoadIntelligenceClient, projectId: string): Promise<RoadConflict[]> {
  const config = await roadConfig(client);
  const source = await client.intervention.findUnique({
    where: { projectId },
    include: { segment: { select: { id: true, roadName: true, lastRestorationDate: true } }, project: { select: { categoryId: true } } },
  });
  if (!source || source.project.categoryId !== config.categoryId) return [];
  const records = await segmentRecords(client, source.segmentId, config.categoryId);
  const detections = evaluateRoadConflicts(projectId, records, source.segment.lastRestorationDate, config.repeatedDays);
  const logged = await Promise.all(detections.map(async (item) => {
    const existing = await client.roadConflictLog.findUnique({
      where: { projectId_type_fingerprint: { projectId: item.projectId, type: item.type, fingerprint: item.fingerprint } },
      select: { id: true },
    });
    const row = await client.roadConflictLog.upsert({
      where: { projectId_type_fingerprint: { projectId: item.projectId, type: item.type, fingerprint: item.fingerprint } },
      update: { severity: item.severity, reason: item.reason },
      create: item,
      include: { conflictingAgency: { select: { id: true, name: true } }, segment: { select: { roadName: true } } },
    });
    if (!existing) {
      const agencyIds = [item.projectAgencyId, item.conflictingAgencyId].filter((id): id is string => id !== null);
      const projects = await client.project.findMany({
        where: { id: { in: [item.projectId, item.conflictingProjectId].filter((id): id is string => id !== null) } },
        select: { engineerId: true },
      });
      const engineerIds = projects.flatMap((project) => project.engineerId ? [project.engineerId] : []);
      const users = await client.user.findMany({
        where: { OR: [
          { agencyId: { in: agencyIds }, role: UserRole.PROJECT_HEAD },
          ...(engineerIds.length ? [{ id: { in: engineerIds }, role: UserRole.ENGINEER }] : []),
        ] },
        select: { id: true, agencyId: true },
      });
      await createNotifications(client, users.map((user) => ({
        userId: user.id,
        type: "ROAD_CONFLICT_DETECTED",
        payload: {
          roadConflictId: row.id,
          projectId: user.agencyId === item.projectAgencyId ? item.projectId : item.conflictingProjectId ?? item.projectId,
          conflictingProjectId: item.conflictingProjectId,
          segmentId: item.segmentId,
          severity: item.severity,
          conflictType: item.type,
          advisory: true,
        },
      })));
    }
    return {
      id: row.id,
      projectId: row.projectId,
      conflictingProjectId: row.conflictingProjectId,
      segmentId: row.segmentId,
      segmentName: row.segment.roadName,
      type: row.type,
      severity: row.severity,
      reason: row.reason,
      conflictingAgency: row.conflictingAgency,
      detectedAt: row.createdAt,
    } satisfies RoadConflict;
  }));

  if (detections.some((item) => item.type === RoadConflictType.SEQUENCING_VIOLATION || item.type === RoadConflictType.RESTORATION_TOO_EARLY)) {
    const draft = buildSequencingRecommendation(records);
    if (draft) {
      const existing = await client.sequencingRecommendation.findUnique({ where: { fingerprint: draft.fingerprint }, select: { id: true } });
      const recommendation = await client.sequencingRecommendation.upsert({
        where: { fingerprint: draft.fingerprint },
        update: { explanation: draft.explanation, proposedOrder: jsonInput(draft.proposedOrder), ruleTrace: jsonInput(draft.ruleTrace), projectIds: draft.projectIds },
        create: { ...draft, proposedOrder: jsonInput(draft.proposedOrder), ruleTrace: jsonInput(draft.ruleTrace), projectIds: draft.projectIds },
        select: { id: true },
      });
      if (!existing) {
        const agencyIds = [...new Set(records.map((item) => item.agencyId))];
        const involvedProjects = await client.project.findMany({
          where: { id: { in: records.map((item) => item.projectId) } },
          select: { engineerId: true },
        });
        const engineerIds = involvedProjects.flatMap((project) => project.engineerId ? [project.engineerId] : []);
        const users = await client.user.findMany({ where: { OR: [
          { role: UserRole.PROJECT_HEAD, agencyId: { in: agencyIds } },
          ...(engineerIds.length ? [{ role: UserRole.ENGINEER, id: { in: engineerIds } }] : []),
        ] }, select: { id: true, agencyId: true } });
        if (users.length > 0) {
          await createNotifications(client, users.map((user) => ({
            userId: user.id,
            type: "SEQUENCING_RECOMMENDATION",
            payload: {
              recommendationId: recommendation.id,
              segmentId: source.segmentId,
              projectId: records.find((item) => item.agencyId === user.agencyId)?.projectId ?? records[0]!.projectId,
            },
          })));
        }
      }
    }
  }
  return logged;
}

export async function recommendationsForSegment(client: RoadIntelligenceClient, segmentId: string): Promise<SequencingRecommendation[]> {
  const rows = await client.sequencingRecommendation.findMany({
    where: { segmentId },
    orderBy: { updatedAt: "desc" },
    take: 1,
    include: { logs: { orderBy: { actedAt: "desc" }, take: 1, select: { outcome: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    segmentId: row.segmentId,
    projectIds: jsonStringArray(row.projectIds),
    proposedOrder: row.proposedOrder as unknown as SequencingOrderItem[],
    explanation: row.explanation,
    ruleTrace: row.ruleTrace as unknown as RuleTrace[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    latestOutcome: row.logs[0]?.outcome ?? null,
  }));
}

export async function isRoadCategory(client: RoadIntelligenceClient, categoryId: string): Promise<boolean> {
  return (await roadConfig(client)).categoryId === categoryId;
}
