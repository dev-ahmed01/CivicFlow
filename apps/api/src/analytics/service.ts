import { Prisma, TicketState, type SequencingRecommendationOutcome } from "db";
import { prisma } from "db";
import type { AnalyticsFilter, AnalyticsReport, MetricRow, PublicDashboard } from "@civicos/shared";

const RESOLVED_STATES: TicketState[] = [TicketState.RESOLVED, TicketState.CLOSED];
const HOUR_MS = 60 * 60 * 1000;

function round(value: number, digits = 1): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round((numerator / denominator) * 100);
}

function average(values: number[]): number | undefined {
  return values.length === 0 ? undefined : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function dateRange(filter: AnalyticsFilter): Prisma.DateTimeFilter | undefined {
  if (!filter.from && !filter.to) return undefined;
  return { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
}

function addCount(map: Map<string, MetricRow>, key: string, row: MetricRow, resolved: boolean): void {
  const current = map.get(key) ?? { ...row, count: 0, total: 0 };
  current.total = (current.total ?? 0) + 1;
  if (resolved) current.count = (current.count ?? 0) + 1;
  map.set(key, current);
}

function countRows(map: Map<string, MetricRow>): MetricRow[] {
  return [...map.values()].map((row) => ({
    ...row,
    ratePercent: percent(row.count ?? 0, row.total ?? 0),
  })).sort((left, right) => left.dimension.localeCompare(right.dimension));
}

function addAverage(map: Map<string, { row: MetricRow; values: number[] }>, key: string, row: MetricRow, hours: number): void {
  const current = map.get(key) ?? { row, values: [] };
  current.values.push(hours);
  map.set(key, current);
}

function averageRows(map: Map<string, { row: MetricRow; values: number[] }>): MetricRow[] {
  return [...map.values()].map(({ row, values }) => ({ ...row, count: values.length, averageHours: average(values) }))
    .sort((left, right) => left.dimension.localeCompare(right.dimension));
}

function firstTransitionHours(createdAt: Date, transitions: Array<{ toState: TicketState; createdAt: Date }>, states: TicketState[]): number | undefined {
  const transition = transitions.find((item) => states.includes(item.toState));
  return transition ? Math.max(0, (transition.createdAt.getTime() - createdAt.getTime()) / HOUR_MS) : undefined;
}

function jsonProjectIds(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export type ProjectHeadPerformance = {
  ticketsResolved: number;
  resolutionRatePercent: number;
  averageInspectionHours: number | null;
  dependencyEscalationRatePercent: number;
  reworkRatePercent: number;
  roadConflicts: number;
};

const projectHeadCache = new Map<string, { expiresAt: number; value: ProjectHeadPerformance }>();

// The operations dashboard displays only these six agency metrics. A dedicated,
// short-lived query avoids building the full admin analytics report on every visit.
export async function buildProjectHeadPerformance(agencyId: string): Promise<ProjectHeadPerformance> {
  const cached = projectHeadCache.get(agencyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [tickets, inspectionTransitions, dependencyTotal, dependencyEscalated, verificationTotal, verificationRework, roadConflicts] = await Promise.all([
    prisma.ticket.findMany({ where: { assignedAgencyId: agencyId }, select: { state: true, project: { select: { id: true } } } }),
    prisma.ticketStateTransition.findMany({
      where: { toState: TicketState.INSPECTION_COMPLETE, ticket: { assignedAgencyId: agencyId } },
      orderBy: { createdAt: "asc" },
      select: { ticketId: true, createdAt: true, ticket: { select: { createdAt: true } } },
    }),
    prisma.dependency.count({ where: { respondingAgencyId: agencyId } }),
    prisma.dependency.count({ where: { respondingAgencyId: agencyId, escalatedAt: { not: null } } }),
    prisma.completionVerification.count({ where: { completionEvidence: { project: { agencyId } } } }),
    prisma.completionVerification.count({ where: { decision: "REWORK_REQUESTED", completionEvidence: { project: { agencyId } } } }),
    prisma.roadConflictLog.count({ where: { projectAgencyId: agencyId } }),
  ]);

  const firstInspectionByTicket = new Map<string, number>();
  for (const transition of inspectionTransitions) {
    if (!firstInspectionByTicket.has(transition.ticketId)) {
      firstInspectionByTicket.set(transition.ticketId, Math.max(0, (transition.createdAt.getTime() - transition.ticket.createdAt.getTime()) / HOUR_MS));
    }
  }

  const resolved = tickets.filter(({ state }) => RESOLVED_STATES.includes(state)).length;
  const value: ProjectHeadPerformance = {
    ticketsResolved: resolved,
    resolutionRatePercent: percent(resolved, tickets.length),
    averageInspectionHours: average([...firstInspectionByTicket.values()]) ?? null,
    dependencyEscalationRatePercent: percent(dependencyEscalated, dependencyTotal),
    reworkRatePercent: percent(verificationRework, verificationTotal),
    roadConflicts,
  };
  projectHeadCache.set(agencyId, { expiresAt: Date.now() + 30_000, value });
  return value;
}

export async function buildAnalyticsReport(filter: AnalyticsFilter): Promise<AnalyticsReport> {
  const createdAt = dateRange(filter);
  const tickets = await prisma.ticket.findMany({
    where: {
      ...(createdAt ? { createdAt } : {}),
      ...(filter.wardId ? { wardId: filter.wardId } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.agencyId ? { assignedAgencyId: filter.agencyId } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      state: true,
      ward: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      assignedAgency: { select: { id: true, name: true } },
      stateTransitions: { orderBy: { createdAt: "asc" }, select: { toState: true, createdAt: true } },
      project: { select: { id: true, agencyId: true, engineerId: true, agency: { select: { name: true } }, engineer: { select: { email: true } } } },
    },
  });
  const ticketIds = tickets.map(({ id }) => id);
  const projectIds = tickets.flatMap(({ project }) => project ? [project.id] : []);
  const wardIds = new Set(tickets.map(({ ward }) => ward.id));
  const segmentFilter = filter.wardId ? { wardId: filter.wardId } : {};
  const eventRange = dateRange(filter);

  const [dependencies, validationRequests, conflicts, verifications, roadConflicts, sequencingLogs] = await Promise.all([
    prisma.dependency.findMany({
      where: { projectId: { in: projectIds }, ...(eventRange ? { createdAt: eventRange } : {}) },
      select: { createdAt: true, respondedAt: true, escalatedAt: true, respondingAgency: { select: { id: true, name: true } } },
    }),
    prisma.validationRequest.findMany({
      where: { ticketId: { in: ticketIds }, ...(eventRange ? { notifiedAt: eventRange } : {}) },
      select: { respondedAt: true, citizen: { select: { ward: { select: { id: true, name: true } } } } },
    }),
    prisma.conflictLog.findMany({
      where: { projectId: { in: projectIds }, ...(eventRange ? { createdAt: eventRange } : {}) },
      select: {
        projectAgency: { select: { id: true, name: true } },
        conflictingAgency: { select: { id: true, name: true } },
        project: { select: { ticket: { select: { ward: { select: { id: true, name: true } } } } } },
      },
    }),
    prisma.completionVerification.findMany({
      where: { completionEvidence: { ticketId: { in: ticketIds } }, ...(eventRange ? { createdAt: eventRange } : {}) },
      select: {
        decision: true,
        completionEvidence: { select: { project: { select: { agency: { select: { id: true, name: true } }, engineer: { select: { id: true, email: true } } } } } },
      },
    }),
    prisma.roadConflictLog.findMany({
      where: { projectId: { in: projectIds }, ...(eventRange ? { createdAt: eventRange } : {}) },
      select: {
        type: true,
        segmentId: true,
        segment: { select: { roadName: true, ward: { select: { id: true, name: true } } } },
        projectAgency: { select: { id: true, name: true } },
      },
    }),
    prisma.sequencingRecommendationLog.findMany({
      where: {
        ...(eventRange ? { actedAt: eventRange } : {}),
        segment: segmentFilter,
        ...(filter.agencyId ? { actedBy: { agencyId: filter.agencyId } } : {}),
      },
      select: {
        recommendationId: true,
        segmentId: true,
        outcome: true,
        recommendation: { select: { projectIds: true } },
        segment: { select: { roadName: true, wardId: true } },
        actedBy: { select: { agency: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const ticketsByCategory = new Map<string, MetricRow>();
  const ticketsByWard = new Map<string, MetricRow>();
  const ticketsByPeriod = new Map<string, MetricRow>();
  const validationTimes = new Map<string, { row: MetricRow; values: number[] }>();
  const inspectionTimes = new Map<string, { row: MetricRow; values: number[] }>();
  const resolutionTimes = new Map<string, { row: MetricRow; values: number[] }>();

  for (const ticket of tickets) {
    const resolved = RESOLVED_STATES.includes(ticket.state);
    addCount(ticketsByCategory, ticket.category.id, { dimension: ticket.category.name, dimensionId: ticket.category.id }, resolved);
    addCount(ticketsByWard, ticket.ward.id, { dimension: ticket.ward.name, dimensionId: ticket.ward.id }, resolved);
    const period = ticket.createdAt.toISOString().slice(0, 7);
    addCount(ticketsByPeriod, period, { dimension: period }, resolved);
    const validationHours = firstTransitionHours(ticket.createdAt, ticket.stateTransitions, [TicketState.VALIDATED, TicketState.ROUTED_TO_AGENCY]);
    if (validationHours !== undefined) addAverage(validationTimes, ticket.ward.id, { dimension: ticket.ward.name, dimensionId: ticket.ward.id }, validationHours);
    const inspectionHours = firstTransitionHours(ticket.createdAt, ticket.stateTransitions, [TicketState.INSPECTION_COMPLETE]);
    if (inspectionHours !== undefined && ticket.assignedAgency) addAverage(inspectionTimes, ticket.assignedAgency.id, { dimension: ticket.assignedAgency.name, dimensionId: ticket.assignedAgency.id }, inspectionHours);
    const resolutionHours = firstTransitionHours(ticket.createdAt, ticket.stateTransitions, [TicketState.RESOLVED, TicketState.CLOSED]);
    if (resolutionHours !== undefined && ticket.assignedAgency) {
      const key = `${ticket.category.id}:${ticket.assignedAgency.id}`;
      addAverage(resolutionTimes, key, { dimension: ticket.category.name, dimensionId: ticket.category.id, secondaryDimension: ticket.assignedAgency.name, secondaryDimensionId: ticket.assignedAgency.id }, resolutionHours);
    }
  }

  const dependencyResponse = new Map<string, { row: MetricRow; values: number[] }>();
  const dependencyEscalation = new Map<string, MetricRow>();
  for (const dependency of dependencies) {
    if (dependency.respondedAt) addAverage(dependencyResponse, dependency.respondingAgency.id, { dimension: dependency.respondingAgency.name, dimensionId: dependency.respondingAgency.id }, (dependency.respondedAt.getTime() - dependency.createdAt.getTime()) / HOUR_MS);
    addCount(dependencyEscalation, dependency.respondingAgency.id, { dimension: dependency.respondingAgency.name, dimensionId: dependency.respondingAgency.id }, Boolean(dependency.escalatedAt));
  }

  const participation = new Map<string, MetricRow>();
  for (const item of validationRequests) {
    const ward = item.citizen.ward;
    if (!ward || (wardIds.size > 0 && !wardIds.has(ward.id))) continue;
    addCount(participation, ward.id, { dimension: ward.name, dimensionId: ward.id }, Boolean(item.respondedAt));
  }

  const conflictRows = new Map<string, MetricRow>();
  for (const conflict of conflicts) {
    const ward = conflict.project.ticket?.ward;
    if (!ward) continue;
    const agencies = [conflict.projectAgency, conflict.conflictingAgency].sort((left, right) => left.name.localeCompare(right.name));
    const key = `${ward.id}:${agencies[0]!.id}:${agencies[1]!.id}`;
    const row = conflictRows.get(key) ?? { dimension: ward.name, dimensionId: ward.id, secondaryDimension: `${agencies[0]!.name} + ${agencies[1]!.name}`, count: 0 };
    row.count = (row.count ?? 0) + 1;
    conflictRows.set(key, row);
  }

  const rework = new Map<string, MetricRow>();
  const notResolved = new Map<string, MetricRow>();
  for (const verification of verifications) {
    const { agency, engineer } = verification.completionEvidence.project;
    const isRework = verification.decision === "REWORK_REQUESTED";
    const engineerKey = engineer?.id ?? "unassigned";
    addCount(rework, `${agency.id}:${engineerKey}`, { dimension: agency.name, dimensionId: agency.id, secondaryDimension: engineer?.email ?? "Unassigned", secondaryDimensionId: engineer?.id }, isRework);
    addCount(notResolved, agency.id, { dimension: agency.name, dimensionId: agency.id }, isRework);
  }

  const roadByWardType = new Map<string, MetricRow>();
  const repeatedRiskSegments = new Set<string>();
  for (const conflict of roadConflicts) {
    const key = `${conflict.segment.ward.id}:${conflict.type}`;
    const row = roadByWardType.get(key) ?? { dimension: conflict.segment.ward.name, dimensionId: conflict.segment.ward.id, secondaryDimension: conflict.type, count: 0 };
    row.count = (row.count ?? 0) + 1;
    roadByWardType.set(key, row);
    if (conflict.type === "REPEATED_EXCAVATION_RISK") repeatedRiskSegments.add(conflict.segmentId);
  }

  const filteredSequencingLogs = sequencingLogs.filter((log) => !filter.categoryId || jsonProjectIds(log.recommendation.projectIds).some((projectId) => projectIds.includes(projectId)));
  const sequencing = new Map<string, MetricRow>();
  const avoided = new Map<string, MetricRow>();
  for (const log of filteredSequencingLogs) {
    const agency = log.actedBy.agency;
    if (!agency) continue;
    const row = sequencing.get(agency.id) ?? { dimension: agency.name, dimensionId: agency.id, accepted: 0, modified: 0, dismissed: 0, total: 0 };
    const outcome = log.outcome.toLowerCase() as Lowercase<SequencingRecommendationOutcome>;
    row[outcome] = (row[outcome] ?? 0) + 1;
    row.total = (row.total ?? 0) + 1;
    sequencing.set(agency.id, row);
    if (log.outcome === "ACCEPTED" && repeatedRiskSegments.has(log.segmentId)) {
      const key = `${log.segmentId}:${agency.id}`;
      const avoidedRow = avoided.get(key) ?? { dimension: log.segment.roadName, dimensionId: log.segmentId, secondaryDimension: agency.name, secondaryDimensionId: agency.id, count: 0 };
      avoidedRow.count = (avoidedRow.count ?? 0) + 1;
      avoided.set(key, avoidedRow);
    }
  }

  const resolvedTotal = tickets.filter((ticket) => RESOLVED_STATES.includes(ticket.state)).length;

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      ...(filter.wardId ? { wardId: filter.wardId } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.agencyId ? { agencyId: filter.agencyId } : {}),
      ...(filter.from ? { from: filter.from.toISOString() } : {}),
      ...(filter.to ? { to: filter.to.toISOString() } : {}),
    },
    totals: { ticketsCreated: tickets.length, ticketsResolved: resolvedTotal, resolutionRatePercent: percent(resolvedTotal, tickets.length), roadConflicts: roadConflicts.length },
    ticketsByCategory: countRows(ticketsByCategory),
    ticketsByWard: countRows(ticketsByWard),
    ticketsByPeriod: countRows(ticketsByPeriod),
    validationTimeByWard: averageRows(validationTimes),
    inspectionTimeByAgency: averageRows(inspectionTimes),
    resolutionTimeByCategoryAgency: averageRows(resolutionTimes),
    dependencyResponseByAgency: averageRows(dependencyResponse),
    dependencyEscalationByAgency: countRows(dependencyEscalation),
    validatorParticipationByWard: countRows(participation),
    conflictsByWardAgencyPair: [...conflictRows.values()],
    reworkByAgencyEngineer: countRows(rework),
    citizenNotResolvedByAgency: countRows(notResolved),
    roadConflictsByWardType: [...roadByWardType.values()],
    repeatedExcavationsAvoidedBySegmentAgency: [...avoided.values()],
    sequencingOutcomesByAgency: [...sequencing.values()],
  };
}

export async function buildPublicDashboard(): Promise<PublicDashboard> {
  const report = await buildAnalyticsReport({});
  const tickets = await prisma.ticket.findMany({
    select: {
      state: true,
      assignedAgency: { select: { id: true, name: true } },
      createdAt: true,
      stateTransitions: { orderBy: { createdAt: "asc" }, select: { toState: true, createdAt: true } },
    },
  });
  const agencies = new Map<string, { agencyId: string; agency: string; created: number; resolved: number; resolutionHours: number[] }>();
  for (const ticket of tickets) {
    if (!ticket.assignedAgency) continue;
    const row = agencies.get(ticket.assignedAgency.id) ?? { agencyId: ticket.assignedAgency.id, agency: ticket.assignedAgency.name, created: 0, resolved: 0, resolutionHours: [] };
    row.created += 1;
    if (RESOLVED_STATES.includes(ticket.state)) row.resolved += 1;
    const hours = firstTransitionHours(ticket.createdAt, ticket.stateTransitions, [TicketState.RESOLVED, TicketState.CLOSED]);
    if (hours !== undefined) row.resolutionHours.push(hours);
    agencies.set(row.agencyId, row);
  }
  return {
    generatedAt: report.generatedAt,
    totals: report.totals,
    categoryBreakdown: report.ticketsByCategory,
    agencyPerformance: [...agencies.values()].map(({ resolutionHours, ...row }) => ({ ...row, resolutionRatePercent: percent(row.resolved, row.created), averageResolutionHours: average(resolutionHours) ?? null })).sort((left, right) => left.agency.localeCompare(right.agency)),
    roadMetrics: {
      conflictsByType: report.roadConflictsByWardType.reduce<MetricRow[]>((rows, item) => {
        const existing = rows.find((row) => row.dimension === item.secondaryDimension);
        if (existing) existing.count = (existing.count ?? 0) + (item.count ?? 0);
        else rows.push({ dimension: item.secondaryDimension ?? "Unknown", count: item.count ?? 0 });
        return rows;
      }, []),
    },
    privacyNotice: "Only city-wide aggregated statistics are published. No citizen identity, contact information, coordinates, observations, or individual ticket records are included.",
  };
}
