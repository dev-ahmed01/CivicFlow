import {
  CompletionVerificationDecision,
  CoordinationStatus,
  DependencyState,
  ProjectState,
  RoadConflictType,
  TicketState,
  prisma,
} from "db";
import type {
  AnalyticsFilter,
  OperationalAnalyticsReport,
  OperationalBreakdownRow,
  OperationalMetric,
  OperationalRecord,
} from "@civicos/shared";

const HOUR_MS = 60 * 60 * 1000;
const PRE_EXECUTION_STATES = new Set<ProjectState>([
  ProjectState.CREATED,
  ProjectState.PENDING_UPTAKE,
  ProjectState.UPTAKEN,
  ProjectState.TIMELINE_SET,
  ProjectState.CONFLICT_CHECKED,
  ProjectState.READY_TO_START,
]);
const BLOCKING_DEPENDENCY_STATES: DependencyState[] = [
  DependencyState.REQUESTED,
  DependencyState.PENDING_RESPONSE,
  DependencyState.ASSIGNED,
  DependencyState.ESCALATED,
  DependencyState.DECLINED_UNAVAILABLE,
];
const CLOSED_COORDINATION_STATUSES: CoordinationStatus[] = [CoordinationStatus.COMPLETED, CoordinationStatus.CLOSED];
const OPEN_COORDINATION_STATUSES: CoordinationStatus[] = [
  CoordinationStatus.SENT,
  CoordinationStatus.ACKNOWLEDGED,
  CoordinationStatus.CLARIFICATION_REQUESTED,
  CoordinationStatus.INSPECTION_REQUIRED,
  CoordinationStatus.ENGINEER_ASSIGNED,
  CoordinationStatus.ACCEPTED,
  CoordinationStatus.IN_PROGRESS,
];
const TERMINAL_PROJECT_STATES: ProjectState[] = [
  ProjectState.COMPLETED,
  ProjectState.AWAITING_VERIFICATION,
  ProjectState.CLOSED,
  ProjectState.CANCELLED,
];

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round((numerator / denominator) * 100);
}

function hoursBetween(start: Date, end: Date): number {
  return round(Math.max(0, end.getTime() - start.getTime()) / HOUR_MS);
}

function serializedFilters(filter: AnalyticsFilter): OperationalAnalyticsReport["filters"] {
  return {
    ...(filter.wardId ? { wardId: filter.wardId } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.agencyId ? { agencyId: filter.agencyId } : {}),
    ...(filter.from ? { from: filter.from.toISOString() } : {}),
    ...(filter.to ? { to: filter.to.toISOString() } : {}),
  };
}

function workRecord(project: {
  id: string;
  referenceNumber: string;
  title: string;
  state: ProjectState;
  createdAt: Date;
  agency: { id: string; name: string };
  ward: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
}): OperationalRecord {
  return {
    id: project.id,
    recordType: "work",
    reference: project.referenceNumber,
    title: project.title,
    status: project.state,
    agency: project.agency.name,
    ward: project.ward?.name,
    category: project.category?.name,
    occurredAt: project.createdAt.toISOString(),
  };
}

function breakdown(
  projects: Array<Parameters<typeof workRecord>[0]>,
  getDimension: (project: Parameters<typeof workRecord>[0]) => { id?: string; name: string },
): OperationalBreakdownRow[] {
  const grouped = new Map<string, OperationalBreakdownRow>();
  for (const project of projects) {
    const dimension = getDimension(project);
    const key = dimension.id ?? dimension.name;
    const row = grouped.get(key) ?? { dimension: dimension.name, dimensionId: dimension.id, count: 0, records: [] };
    row.count += 1;
    row.records.push(workRecord(project));
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count || left.dimension.localeCompare(right.dimension));
}

function metric(
  key: OperationalMetric["key"],
  label: string,
  value: number | null,
  unit: OperationalMetric["unit"],
  description: string,
  optional: Pick<OperationalMetric, "numerator" | "denominator" | "sampleSize"> = {},
): OperationalMetric {
  return { key, label, value, unit, description, ...optional };
}

// Phase 7 operational analytics — every result is derived from an addressable
// work, conflict, dependency, coordination, or verification record. No monetary
// saving is inferred from these inputs.
export async function buildOperationalAnalytics(filter: AnalyticsFilter, now = new Date()): Promise<OperationalAnalyticsReport> {
  const projects = await prisma.project.findMany({
    where: {
      ...(filter.agencyId ? { agencyId: filter.agencyId } : {}),
      ...(filter.wardId ? { wardId: filter.wardId } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...((filter.from || filter.to) ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      state: true,
      createdAt: true,
      actualStart: true,
      agency: { select: { id: true, name: true } },
      ward: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      ticket: { select: { state: true } },
      stateTransitions: {
        where: { toState: ProjectState.ACTIVE },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  const projectIds = projects.map(({ id }) => id);

  const [projectConflicts, roadConflicts, dependencies, coordinationRequests, completionEvidence] = await Promise.all([
    prisma.conflictLog.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
        severity: true,
        locationDescription: true,
        projectId: true,
        conflictingProject: { select: { referenceNumber: true, title: true } },
        projectAgency: { select: { name: true } },
        conflictingAgency: { select: { name: true } },
        coordinationRequests: { select: { status: true } },
      },
    }),
    prisma.roadConflictLog.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
        type: true,
        severity: true,
        reason: true,
        projectId: true,
        segmentId: true,
        segment: { select: { roadName: true } },
        conflictingProject: { select: { referenceNumber: true, title: true } },
        projectAgency: { select: { name: true } },
        conflictingAgency: { select: { name: true } },
        coordinationRequests: { select: { status: true } },
        project: { select: { intervention: { select: { affectedLengthM: true } } } },
      },
    }),
    prisma.dependency.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        projectId: true,
        state: true,
        requirement: true,
        deadline: true,
        createdAt: true,
        respondedAt: true,
        requestingAgency: { select: { name: true } },
        respondingAgency: { select: { name: true } },
        stateTransitions: { orderBy: { createdAt: "asc" }, select: { toState: true, createdAt: true } },
      },
    }),
    prisma.coordinationRequest.findMany({
      where: { projectId: { in: projectIds }, status: { not: CoordinationStatus.DRAFT } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        projectId: true,
        subject: true,
        status: true,
        sentAt: true,
        closedAt: true,
        responseDeadline: true,
        requestingAgency: { select: { name: true } },
        respondingAgency: { select: { name: true } },
      },
    }),
    prisma.completionEvidence.findMany({
      where: { projectId: { in: projectIds }, uploadedAt: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        projectId: true,
        createdAt: true,
        verifications: { orderBy: { createdAt: "asc" }, select: { decision: true, createdAt: true } },
      },
    }),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const conflictIsResolved = (requests: Array<{ status: CoordinationStatus }>) => requests.some(({ status }) => CLOSED_COORDINATION_STATUSES.includes(status));
  const detectedBeforeExecution = (projectId: string, detectedAt: Date) => {
    const project = projectById.get(projectId);
    if (!project) return false;
    const executionStartedAt = project.actualStart ?? project.stateTransitions[0]?.createdAt;
    if (executionStartedAt) return detectedAt <= executionStartedAt;
    return PRE_EXECUTION_STATES.has(project.state);
  };

  const allConflictRecords = [
    ...projectConflicts.map((conflict) => {
      const project = projectById.get(conflict.projectId)!;
      return {
        beforeExecution: detectedBeforeExecution(conflict.projectId, conflict.createdAt),
        resolved: conflictIsResolved(conflict.coordinationRequests),
        record: {
          id: conflict.id,
          recordType: "conflict" as const,
          reference: conflict.id,
          title: project.title,
          status: conflictIsResolved(conflict.coordinationRequests) ? "RESOLVED" : "UNRESOLVED",
          agency: conflict.projectAgency.name,
          counterpartAgency: conflict.conflictingAgency.name,
          ward: project.ward?.name,
          category: project.category?.name,
          occurredAt: conflict.createdAt.toISOString(),
          relatedReference: conflict.conflictingProject.referenceNumber,
          detail: `${conflict.severity} · ${conflict.locationDescription}`,
        } satisfies OperationalRecord,
      };
    }),
    ...roadConflicts.map((conflict) => {
      const project = projectById.get(conflict.projectId)!;
      return {
        beforeExecution: detectedBeforeExecution(conflict.projectId, conflict.createdAt),
        resolved: conflictIsResolved(conflict.coordinationRequests),
        record: {
          id: conflict.id,
          recordType: "road-conflict" as const,
          reference: conflict.id,
          title: project.title,
          status: conflictIsResolved(conflict.coordinationRequests) ? "RESOLVED" : "UNRESOLVED",
          agency: conflict.projectAgency.name,
          counterpartAgency: conflict.conflictingAgency?.name,
          ward: project.ward?.name,
          category: project.category?.name,
          occurredAt: conflict.createdAt.toISOString(),
          relatedReference: conflict.conflictingProject?.referenceNumber,
          detail: `${conflict.type} · ${conflict.segment.roadName} · ${conflict.reason}`,
        } satisfies OperationalRecord,
      };
    }),
  ];
  const conflictsBeforeExecution = allConflictRecords.filter(({ beforeExecution }) => beforeExecution);
  const resolvedConflicts = allConflictRecords.filter(({ resolved }) => resolved);

  const responseStates = new Set<DependencyState>([
    DependencyState.ASSIGNED,
    DependencyState.DECLINED_UNAVAILABLE,
    DependencyState.DECLINED_NOT_CONCERNED,
    DependencyState.FULFILLED,
  ]);
  const dependencyResponses = dependencies.flatMap((dependency) => {
    const project = projectById.get(dependency.projectId)!;
    const firstResponse = dependency.stateTransitions.find(({ toState }) => responseStates.has(toState))?.createdAt ?? dependency.respondedAt;
    if (!firstResponse) return [];
    const durationHours = hoursBetween(dependency.createdAt, firstResponse);
    return [{
      id: dependency.id,
      recordType: "dependency" as const,
      reference: dependency.id,
      title: project.title,
      status: dependency.state,
      agency: dependency.requestingAgency.name,
      counterpartAgency: dependency.respondingAgency.name,
      ward: project.ward?.name,
      category: project.category?.name,
      occurredAt: dependency.createdAt.toISOString(),
      deadline: dependency.deadline.toISOString(),
      durationHours,
      relatedReference: project.referenceNumber,
      detail: dependency.requirement,
    } satisfies OperationalRecord];
  });

  const blockedDependencies = dependencies.filter(({ state, projectId }) => {
    const project = projectById.get(projectId);
    return project && !TERMINAL_PROJECT_STATES.includes(project.state) && BLOCKING_DEPENDENCY_STATES.includes(state);
  });
  const blockedProjectIds = new Set(blockedDependencies.map(({ projectId }) => projectId));
  const blockedWorks = projects.filter(({ id }) => blockedProjectIds.has(id)).map((project) => {
    const blockers = blockedDependencies.filter(({ projectId }) => projectId === project.id);
    return {
      ...workRecord(project),
      status: "BLOCKED",
      counterpartAgency: [...new Set(blockers.map(({ respondingAgency }) => respondingAgency.name))].join(", "),
      detail: blockers.map(({ requirement }) => requirement).join("; "),
    } satisfies OperationalRecord;
  });

  const completedCoordination = coordinationRequests.filter((request) => request.sentAt && request.closedAt);
  const coordinationRecords = completedCoordination.map((request) => {
    const project = projectById.get(request.projectId)!;
    return {
      id: request.id,
      recordType: "coordination" as const,
      reference: request.id,
      title: request.subject,
      status: request.status,
      agency: request.requestingAgency.name,
      counterpartAgency: request.respondingAgency.name,
      ward: project.ward?.name,
      category: project.category?.name,
      occurredAt: request.sentAt!.toISOString(),
      deadline: request.responseDeadline.toISOString(),
      durationHours: hoursBetween(request.sentAt!, request.closedAt!),
      relatedReference: project.referenceNumber,
    } satisfies OperationalRecord;
  });
  const overdueCoordination = coordinationRequests.filter((request) => OPEN_COORDINATION_STATUSES.includes(request.status) && request.responseDeadline < now).map((request) => {
    const project = projectById.get(request.projectId)!;
    return {
      id: request.id,
      recordType: "coordination" as const,
      reference: request.id,
      title: request.subject,
      status: request.status,
      agency: request.requestingAgency.name,
      counterpartAgency: request.respondingAgency.name,
      ward: project.ward?.name,
      category: project.category?.name,
      occurredAt: request.sentAt?.toISOString(),
      deadline: request.responseDeadline.toISOString(),
      relatedReference: project.referenceNumber,
      detail: `${hoursBetween(request.responseDeadline, now)} hours overdue`,
    } satisfies OperationalRecord;
  });

  const repeatedRoadConflicts = roadConflicts.filter(({ type }) => type === RoadConflictType.REPEATED_EXCAVATION_RISK || type === RoadConflictType.DUPLICATE_INTERVENTION);
  const repeatedRecords = repeatedRoadConflicts.map((conflict) => {
    const project = projectById.get(conflict.projectId)!;
    return {
      id: conflict.id,
      recordType: "road-conflict" as const,
      reference: conflict.id,
      title: project.title,
      status: conflict.type,
      agency: conflict.projectAgency.name,
      counterpartAgency: conflict.conflictingAgency?.name,
      ward: project.ward?.name,
      category: project.category?.name,
      occurredAt: conflict.createdAt.toISOString(),
      relatedReference: project.referenceNumber,
      detail: `${conflict.segment.roadName} · ${conflict.reason}`,
    } satisfies OperationalRecord;
  });

  const firstEvidenceByProject = new Map<string, (typeof completionEvidence)[number]>();
  for (const evidence of completionEvidence) {
    if (!firstEvidenceByProject.has(evidence.projectId)) firstEvidenceByProject.set(evidence.projectId, evidence);
  }
  const assessableFirstAttempts = [...firstEvidenceByProject.values()].filter(({ verifications }) => verifications.length > 0);
  const firstTimeCompletions = assessableFirstAttempts.filter(({ verifications }) =>
    verifications.some(({ decision }) => decision === CompletionVerificationDecision.VERIFIED)
      && verifications.every(({ decision }) => decision !== CompletionVerificationDecision.REWORK_REQUESTED));
  const firstTimeRecords = assessableFirstAttempts.map((evidence) => {
    const project = projectById.get(evidence.projectId)!;
    const passedFirstTime = firstTimeCompletions.some(({ id }) => id === evidence.id);
    return {
      ...workRecord(project),
      id: evidence.id,
      recordType: "completion" as const,
      reference: evidence.id,
      status: passedFirstTime ? "FIRST_ATTEMPT_VERIFIED" : "REWORK_RECORDED",
      relatedReference: project.referenceNumber,
      occurredAt: evidence.verifications[0]!.createdAt.toISOString(),
      detail: passedFirstTime
        ? "First uploaded completion attempt has verification and no rework request."
        : "First uploaded completion attempt has a recorded rework request.",
    } satisfies OperationalRecord;
  });

  const evidenceByProject = new Map<string, (typeof completionEvidence)[number][]>();
  for (const evidence of completionEvidence) {
    const records = evidenceByProject.get(evidence.projectId) ?? [];
    records.push(evidence);
    evidenceByProject.set(evidence.projectId, records);
  }
  const closedTicketStates: TicketState[] = [TicketState.RESOLVED, TicketState.CLOSED];
  const closedWorks = projects.filter(({ ticket }) => ticket && closedTicketStates.includes(ticket.state));
  const verifiedClosedWorks = closedWorks.filter((project) => evidenceByProject.get(project.id)?.some(({ verifications }) =>
    verifications.some(({ decision }) => decision === CompletionVerificationDecision.VERIFIED)));
  const verifiedClosureRecords = closedWorks.map((project) => ({
    ...workRecord(project),
    status: verifiedClosedWorks.some(({ id }) => id === project.id) ? "VERIFIED_CLOSURE" : "CLOSURE_WITHOUT_VERIFICATION",
    detail: verifiedClosedWorks.some(({ id }) => id === project.id)
      ? "Resolved or closed ticket with a recorded VERIFIED completion decision."
      : "Resolved or closed ticket without a recorded VERIFIED completion decision.",
  } satisfies OperationalRecord));

  const riskSegmentIds = [...new Set(repeatedRoadConflicts.map(({ segmentId }) => segmentId))];
  const acceptedSequencingRecommendations = riskSegmentIds.length === 0 ? 0 : await prisma.sequencingRecommendationLog.count({
    where: { segmentId: { in: riskSegmentIds }, outcome: "ACCEPTED" },
  });
  const affectedLengthByProject = new Map<string, number>();
  for (const conflict of repeatedRoadConflicts) {
    const length = conflict.project.intervention?.affectedLengthM;
    if (length !== undefined && length !== null) affectedLengthByProject.set(conflict.projectId, length);
  }
  const affectedLengthMeters = round([...affectedLengthByProject.values()].reduce((sum, length) => sum + length, 0));

  const metrics: OperationalMetric[] = [
    metric("conflicts-before-execution", "Conflicts detected before execution", conflictsBeforeExecution.length, "count", "Conflict logs created before the work's recorded actual/ACTIVE start; pre-start works with no start timestamp are included."),
    metric("conflicts-resolved", "Conflicts resolved", resolvedConflicts.length, "count", "Detected conflicts linked to a coordination request marked completed or closed.", { numerator: resolvedConflicts.length, denominator: allConflictRecords.length }),
    metric("dependency-response-time", "Dependency response time", average(dependencyResponses.map(({ durationHours }) => durationHours ?? 0)), "hours", "Average from dependency creation to its first recorded assignment, decline, or fulfilment.", { sampleSize: dependencyResponses.length }),
    metric("works-blocked", "Works blocked by another agency", blockedWorks.length, "count", "Non-terminal works with an unresolved or unavailable inter-agency dependency."),
    metric("coordination-turnaround", "Coordination turnaround", average(coordinationRecords.map(({ durationHours }) => durationHours ?? 0)), "hours", "Average from sent to closed for coordination requests with both timestamps.", { sampleSize: coordinationRecords.length }),
    metric("repeated-excavation", "Repeated work / excavation", repeatedRecords.length, "count", "Recorded repeated-excavation-risk and duplicate-intervention advisories on the same road segment."),
    metric("first-time-completion", "First-time completion", percent(firstTimeCompletions.length, assessableFirstAttempts.length), "percent", "Share of first uploaded completion attempts with a verification and no rework request.", { numerator: firstTimeCompletions.length, denominator: assessableFirstAttempts.length }),
    metric("verified-closure", "Verified closure rate", percent(verifiedClosedWorks.length, closedWorks.length), "percent", "Share of resolved/closed ticket-backed works with a recorded VERIFIED completion decision.", { numerator: verifiedClosedWorks.length, denominator: closedWorks.length }),
    metric("overdue-coordination", "Overdue coordination requests", overdueCoordination.length, "count", "Open, sent coordination requests past their recorded response deadline."),
  ];

  return {
    generatedAt: now.toISOString(),
    filters: serializedFilters(filter),
    metrics,
    details: {
      "conflicts-before-execution": conflictsBeforeExecution.map(({ record }) => record),
      "conflicts-resolved": resolvedConflicts.map(({ record }) => record),
      "dependency-response-time": dependencyResponses,
      "works-blocked": blockedWorks,
      "coordination-turnaround": coordinationRecords,
      "repeated-excavation": repeatedRecords,
      "first-time-completion": firstTimeRecords,
      "verified-closure": verifiedClosureRecords,
      "overdue-coordination": overdueCoordination,
    },
    workBreakdown: {
      byAgency: breakdown(projects, ({ agency }) => ({ id: agency.id, name: agency.name })),
      byWard: breakdown(projects, ({ ward }) => ({ id: ward?.id, name: ward?.name ?? "Ward not recorded" })),
      byType: breakdown(projects, ({ category }) => ({ id: category?.id, name: category?.name ?? "Type not recorded" })),
    },
    conservationInputs: {
      repeatedRiskSegments: riskSegmentIds.length,
      affectedLengthMeters,
      acceptedSequencingRecommendations,
      note: "Measured planning inputs only. No financial savings are calculated or claimed.",
    },
  };
}
