import {
  CivicWorkOrigin,
  DependencyState,
  Prisma,
  ProjectState,
  UserRole,
  prisma,
} from "db";
import type {
  CancelCivicWork,
  CivicWorkCalendarItem,
  CivicWorkCalendarQuery,
  CivicWorkGeometry,
  CivicWorkLedgerEvent,
  CivicWorkLedgerQuery,
  CivicWorkPeriod,
  CreatePlannedCivicWork,
  ListCivicWorksQuery,
  NearbyCivicWorksQuery,
  PublicCivicWork,
  PublicCivicWorkStatus,
  UpdateCivicWork,
  UserRole as SharedUserRole,
} from "@civicos/shared";
import { createNotification } from "../notifications/service";
import { checkProjectConflicts } from "../conflicts/service";
import { checkRoadConflicts, isRoadCategory } from "../road-intelligence/service";
import {
  copyRoadSegmentGeometry,
  findCivicWork,
  geometryIsCoveredByWard,
  listCivicWorkCalendarRecords,
  listCivicWorkLedgerRecords,
  listCivicWorkRecords,
  readCivicWorkGeometries,
  writeCivicWorkGeometry,
  type CivicWorkClient,
  type CivicWorkCalendarRecord,
  type CivicWorkRecord,
} from "./repository";

export type CivicWorkActor = {
  userId: string;
  role: SharedUserRole;
  agencyId: string | null;
};

export class CivicWorkError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

function requiredAgency(actor: CivicWorkActor): string {
  if (!actor.agencyId) throw new CivicWorkError(403, "This account is not assigned to an agency", "AGENCY_REQUIRED");
  return actor.agencyId;
}

export function civicWorkManageAgency(actor: CivicWorkActor): string {
  if (actor.role !== UserRole.PROJECT_HEAD) {
    throw new CivicWorkError(403, "Only Project Heads can manage planned works", "PLANNED_WORK_FORBIDDEN");
  }
  return requiredAgency(actor);
}

export function civicWorkReadScope(actor: CivicWorkActor): Prisma.ProjectWhereInput {
  if (actor.role === UserRole.ADMIN) return {};
  const agencyId = requiredAgency(actor);
  if (actor.role === UserRole.PROJECT_HEAD) return { agencyId };
  if (actor.role === UserRole.ENGINEER) return { agencyId, engineerId: actor.userId };
  throw new CivicWorkError(403, "Civic Work Registry access is limited to operational users", "CIVIC_WORK_FORBIDDEN");
}

export function assertCoordinationRead(actor: CivicWorkActor): void {
  if (actor.role !== UserRole.PROJECT_HEAD && actor.role !== UserRole.ADMIN) {
    throw new CivicWorkError(403, "The work calendar is limited to Project Heads and Administrators", "WORK_CALENDAR_FORBIDDEN");
  }
}

export function assertCitizenTransparencyRead(actor: CivicWorkActor): void {
  if (actor.role !== UserRole.CITIZEN) {
    throw new CivicWorkError(403, "Nearby Works is a citizen transparency view", "NEARBY_WORKS_FORBIDDEN");
  }
}

export type PublicCivicWorkRow = {
  id: string;
  referenceNumber: string;
  workType: string;
  agency: string;
  ward: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  state: ProjectState;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualCompletion: Date | null;
};

const publicStatusByProjectState: Record<ProjectState, {
  status: PublicCivicWorkStatus;
  statusLabel: string;
  publicProgress: string;
  completionStatus: PublicCivicWork["completionStatus"];
}> = {
  CREATED: { status: "PLANNED", statusLabel: "Being prepared", publicProgress: "The agency is preparing this work.", completionStatus: "NOT_STARTED" },
  PENDING_UPTAKE: { status: "PLANNED", statusLabel: "Being prepared", publicProgress: "The agency is preparing this work.", completionStatus: "NOT_STARTED" },
  UPTAKEN: { status: "PLANNED", statusLabel: "Being prepared", publicProgress: "The work team is preparing the next steps.", completionStatus: "NOT_STARTED" },
  TIMELINE_SET: { status: "SCHEDULED", statusLabel: "Scheduled", publicProgress: "The work has been scheduled.", completionStatus: "NOT_STARTED" },
  CONFLICT_CHECKED: { status: "SCHEDULED", statusLabel: "Scheduled", publicProgress: "The work has been scheduled.", completionStatus: "NOT_STARTED" },
  ACTIVE: { status: "IN_PROGRESS", statusLabel: "In progress", publicProgress: "Work is currently in progress.", completionStatus: "IN_PROGRESS" },
  MODIFIED: { status: "IN_PROGRESS", statusLabel: "In progress", publicProgress: "Work is in progress with an updated plan.", completionStatus: "IN_PROGRESS" },
  COMPLETED: { status: "COMPLETED", statusLabel: "Completed", publicProgress: "The agency has marked the work complete.", completionStatus: "COMPLETED" },
  AWAITING_VERIFICATION: { status: "COMPLETED", statusLabel: "Completion check", publicProgress: "The completed work is being verified.", completionStatus: "COMPLETED" },
  CLOSED: { status: "COMPLETED", statusLabel: "Completed", publicProgress: "The work is complete.", completionStatus: "COMPLETED" },
  CANCELLED: { status: "PLANNED", statusLabel: "Not proceeding", publicProgress: "This work is not proceeding.", completionStatus: "NOT_STARTED" },
};

// Phase 5 citizen transparency boundary: construct every response field
// explicitly. Never serialize a Project record into the citizen application.
export function toPublicCivicWork(row: PublicCivicWorkRow): PublicCivicWork {
  const presentation = publicStatusByProjectState[row.state];
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    workType: row.workType,
    agency: row.agency,
    approximateLocation: {
      ward: row.ward,
      latitude: row.latitude,
      longitude: row.longitude,
    },
    distanceMeters: Math.max(0, Math.round(row.distanceMeters)),
    ...presentation,
    plannedStart: row.plannedStart,
    expectedCompletion: row.plannedEnd,
    completedAt: row.actualCompletion,
  };
}

export async function listNearbyCivicWorks(actor: CivicWorkActor, query: NearbyCivicWorksQuery) {
  assertCitizenTransparencyRead(actor);
  const rows = await prisma.$queryRaw<PublicCivicWorkRow[]>(Prisma.sql`
    SELECT project."id",
      project."referenceNumber",
      category."name" AS "workType",
      agency."name" AS "agency",
      ward."name" AS "ward",
      ROUND(ST_Y(ST_Centroid(project."geometry"))::numeric, 3)::double precision AS "latitude",
      ROUND(ST_X(ST_Centroid(project."geometry"))::numeric, 3)::double precision AS "longitude",
      ST_Distance(
        project."geometry"::geography,
        ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography
      )::double precision AS "distanceMeters",
      project."state",
      project."plannedStart",
      project."plannedEnd",
      project."actualCompletion"
    FROM "Project" AS project
    JOIN "Category" AS category ON category."id" = project."categoryId"
    JOIN "Agency" AS agency ON agency."id" = project."agencyId"
    JOIN "Ward" AS ward ON ward."id" = project."wardId"
    WHERE project."geometry" IS NOT NULL
      AND project."state" NOT IN ('CREATED', 'CANCELLED')
      AND ST_DWithin(
        project."geometry"::geography,
        ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography,
        ${query.radiusMeters}
      )
    ORDER BY "distanceMeters" ASC, project."createdAt" DESC
    LIMIT ${query.limit}
  `);
  return { works: rows.map(toPublicCivicWork), radiusMeters: query.radiusMeters };
}

const terminalProjectStates = new Set<ProjectState>([
  ProjectState.COMPLETED,
  ProjectState.AWAITING_VERIFICATION,
  ProjectState.CLOSED,
  ProjectState.CANCELLED,
]);

export function classifyCivicWorkPeriod(work: {
  state: ProjectState;
  plannedStart: Date | string | null;
  plannedEnd: Date | string | null;
  actualStart?: Date | string | null;
  actualCompletion?: Date | string | null;
  cancelledAt?: Date | string | null;
}, asOf = new Date()): CivicWorkPeriod {
  if (terminalProjectStates.has(work.state) || work.actualCompletion || work.cancelledAt) return "PAST";
  const start = work.plannedStart ? new Date(work.plannedStart) : null;
  const end = work.plannedEnd ? new Date(work.plannedEnd) : null;
  if (start && start > asOf) return "FUTURE";
  if (end && end < asOf) return "PAST";
  return "CURRENT";
}

function calendarItem(record: CivicWorkCalendarRecord, geometry: CivicWorkGeometry, asOf: Date): CivicWorkCalendarItem {
  const fulfilled = record.dependencies.filter(({ state }) => state === DependencyState.FULFILLED).length;
  const openStates: DependencyState[] = [
    DependencyState.REQUESTED,
    DependencyState.PENDING_RESPONSE,
    DependencyState.ASSIGNED,
    DependencyState.ESCALATED,
  ];
  const open = record.dependencies.filter(({ state }) => openStates.includes(state)).length;
  const blockedBy = [...new Map(record.dependencies
    .filter(({ state }) => openStates.includes(state))
    .map(({ respondingAgency }) => [respondingAgency.id, respondingAgency])).values()];
  const revisionMetadata = record.auditEvents[0]?.metadata;
  const originalStartValue = revisionMetadata && !Array.isArray(revisionMetadata) && typeof revisionMetadata === "object"
    ? revisionMetadata.originalPlannedStart
    : null;
  const originalEndValue = revisionMetadata && !Array.isArray(revisionMetadata) && typeof revisionMetadata === "object"
    ? revisionMetadata.originalPlannedEnd
    : null;
  return {
    id: record.id,
    referenceNumber: record.referenceNumber,
    title: record.title,
    description: record.description,
    locationLabel: record.locationLabel,
    origin: record.origin,
    priority: record.priority,
    state: record.state,
    plannedStart: record.plannedStart,
    plannedEnd: record.plannedEnd,
    actualStart: record.actualStart,
    actualCompletion: record.actualCompletion,
    cancelledAt: record.cancelledAt,
    geometry,
    period: classifyCivicWorkPeriod(record, asOf),
    category: record.category,
    agency: record.agency,
    ward: record.ward,
    engineer: record.engineer,
    roadSegment: record.intervention?.segment ?? null,
    evidenceCount: record._count.evidence,
    dependencySummary: { total: record.dependencies.length, open, fulfilled, blocked: open > 0, blockedBy },
    originalPlannedStart: typeof originalStartValue === "string" ? new Date(originalStartValue) : null,
    originalPlannedEnd: typeof originalEndValue === "string" ? new Date(originalEndValue) : null,
    conflictCount: record._count.conflictLogs + record._count.conflictingLogs,
    roadConflictCount: record._count.roadConflictLogs + record._count.conflictingRoadLogs,
  };
}

function eventDetail(metadata: Prisma.JsonValue): string | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  for (const key of ["reason", "note", "changedFields"]) {
    const value = metadata[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ") || null;
  }
  return null;
}

function eventTitle(value: string): string {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  return normalized ? `${normalized[0]?.toUpperCase()}${normalized.slice(1)}` : value;
}

function assertDateRange(start: Date, end: Date): void {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    throw new CivicWorkError(422, "Proposed end must be on or after proposed start", "INVALID_DATE_RANGE");
  }
}

async function assertCategoryForAgency(client: CivicWorkClient, categoryId: string, agencyId: string): Promise<void> {
  const category = await client.category.findFirst({
    where: {
      id: categoryId,
      OR: [
        { primaryAgencyId: agencyId },
        { routingRules: { some: { dependencyAgencyId: agencyId } } },
      ],
    },
    select: { id: true },
  });
  if (!category) {
    throw new CivicWorkError(422, "Choose a category configured for your agency", "CATEGORY_NOT_OWNED");
  }
}

async function assertEngineerForAgency(client: CivicWorkClient, engineerId: string | null | undefined, agencyId: string): Promise<void> {
  if (!engineerId) return;
  const engineer = await client.user.findFirst({
    where: { id: engineerId, agencyId, role: UserRole.ENGINEER },
    select: { id: true },
  });
  if (!engineer) {
    throw new CivicWorkError(422, "Choose an Engineer from your agency roster", "ENGINEER_NOT_OWNED");
  }
}

async function assertGeometryForWard(
  client: CivicWorkClient,
  wardId: string,
  geometry: CivicWorkGeometry,
): Promise<void> {
  if (!(await geometryIsCoveredByWard(client, wardId, geometry))) {
    throw new CivicWorkError(422, "Work geometry must be valid and contained by the selected ward", "INVALID_WORK_GEOMETRY");
  }
}

async function assertInterventionReferences(
  client: CivicWorkClient,
  wardId: string,
  intervention: NonNullable<CreatePlannedCivicWork["intervention"]>,
): Promise<void> {
  const segment = await client.roadSegment.findFirst({
    where: { id: intervention.segmentId, wardId },
    select: { id: true },
  });
  if (!segment) throw new CivicWorkError(422, "Choose a road segment in the selected ward", "ROAD_SEGMENT_INVALID");
  const uniqueRefs = [...new Set(intervention.dependencyRefs)];
  if (uniqueRefs.length !== intervention.dependencyRefs.length) {
    throw new CivicWorkError(422, "Road dependency references must be unique", "INTERVENTION_REFERENCE_INVALID");
  }
  if (uniqueRefs.length > 0) {
    const referenceCount = await client.intervention.count({ where: { id: { in: uniqueRefs }, segmentId: intervention.segmentId } });
    if (referenceCount !== uniqueRefs.length) {
      throw new CivicWorkError(422, "Road dependency references must exist on the selected segment", "INTERVENTION_REFERENCE_INVALID");
    }
  }
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function civicWorkForResponse(client: CivicWorkClient, record: CivicWorkRecord) {
  const geometries = await readCivicWorkGeometries(client, [record.id]);
  const geometry = geometries.get(record.id);
  return {
    ...record,
    geometry: geometry ?? null,
    citizenTicketReference: record.ticket,
    roadSegment: record.intervention?.segment ?? null,
    dependencyCount: record._count.dependencies,
    conflictCount: record._count.conflictLogs + record._count.conflictingLogs,
    roadConflictCount: record._count.roadConflictLogs + record._count.conflictingRoadLogs,
    audit: record.auditEvents,
    _count: undefined,
    auditEvents: undefined,
    intervention: undefined,
    ticket: undefined,
  };
}

export async function createPlannedCivicWork(actor: CivicWorkActor, input: CreatePlannedCivicWork) {
  const agencyId = civicWorkManageAgency(actor);
  const plannedStart = new Date(input.proposedStart);
  const plannedEnd = new Date(input.proposedEnd);
  assertDateRange(plannedStart, plannedEnd);

  const createdId = await prisma.$transaction(async (transaction) => {
    await assertCategoryForAgency(transaction, input.categoryId, agencyId);
    await assertEngineerForAgency(transaction, input.engineerId, agencyId);
    const roadCategory = await isRoadCategory(transaction, input.categoryId);
    if (roadCategory && !input.intervention) {
      throw new CivicWorkError(422, "Road works require a road-segment intervention", "ROAD_INTERVENTION_REQUIRED");
    }
    if (!roadCategory && input.intervention) {
      throw new CivicWorkError(422, "Road interventions are only valid for the configured road category", "ROAD_INTERVENTION_NOT_ALLOWED");
    }
    if (input.intervention) await assertInterventionReferences(transaction, input.wardId, input.intervention);
    else if (input.geometry) await assertGeometryForWard(transaction, input.wardId, input.geometry);
    else throw new CivicWorkError(422, "Work geometry is required", "WORK_GEOMETRY_REQUIRED");

    const nextState = input.engineerId ? ProjectState.PENDING_UPTAKE : ProjectState.TIMELINE_SET;
    const project = await transaction.project.create({
      data: {
        categoryId: input.categoryId,
        agencyId,
        ownerProjectHeadId: actor.userId,
        createdById: actor.userId,
        updatedById: actor.userId,
        origin: CivicWorkOrigin.AGENCY_PLANNED,
        title: input.title,
        description: input.description,
        locationLabel: input.locationLabel,
        wardId: input.wardId,
        priority: input.priority,
        plannedStart,
        plannedEnd,
        workDescription: input.description,
        engineerId: input.engineerId,
        state: nextState,
        stateTransitions: {
          create: [
            { fromState: null, toState: ProjectState.CREATED, reason: "PLANNED_WORK_REGISTERED", actedById: actor.userId },
            {
              fromState: ProjectState.CREATED,
              toState: nextState,
              reason: input.engineerId ? "ENGINEER_ASSIGNED" : "PLANNED_TIMELINE_REGISTERED",
              actedById: actor.userId,
            },
          ],
        },
        auditEvents: {
          create: { action: "PLANNED_WORK_CREATED", actorId: actor.userId, metadata: asInputJson({ origin: CivicWorkOrigin.AGENCY_PLANNED }) },
        },
        ...(input.intervention ? {
          intervention: {
            create: {
              segmentId: input.intervention.segmentId,
              requestingAgencyId: agencyId,
              purpose: input.intervention.purpose,
              plannedStart,
              plannedEnd,
              affectedLengthM: input.intervention.affectedLengthM,
              startOffsetM: input.intervention.startOffsetM,
              dependencyRefs: input.intervention.dependencyRefs,
            },
          },
        } : {}),
      },
      select: { id: true },
    });
    if (input.intervention) await copyRoadSegmentGeometry(transaction, project.id, input.intervention.segmentId);
    else await writeCivicWorkGeometry(transaction, project.id, input.geometry!);
    if (input.engineerId) {
      await createNotification(transaction, {
        userId: input.engineerId,
        type: "PROJECT_ASSIGNMENT",
        payload: { projectId: project.id, plannedWork: true },
      });
    }
    // Phase 4 — registry entry immediately enters both existing advisory
    // checks. Neither result blocks registration or engineer assignment.
    await checkProjectConflicts(transaction, project.id);
    await checkRoadConflicts(transaction, project.id);
    return project.id;
  });

  return getCivicWork(actor, createdId);
}

export async function getCivicWork(actor: CivicWorkActor, id: string) {
  const record = await findCivicWork(prisma, id, civicWorkReadScope(actor));
  if (!record) throw new CivicWorkError(404, "Civic work not found", "CIVIC_WORK_NOT_FOUND");
  return civicWorkForResponse(prisma, record);
}

export async function listCivicWorks(actor: CivicWorkActor, query: ListCivicWorksQuery) {
  const scope = civicWorkReadScope(actor);
  if (actor.role !== UserRole.ADMIN && query.agencyId && query.agencyId !== actor.agencyId) {
    throw new CivicWorkError(403, "You cannot list another agency's civic works", "AGENCY_SCOPE_FORBIDDEN");
  }
  const { records, total } = await listCivicWorkRecords(prisma, query, scope);
  const geometries = await readCivicWorkGeometries(prisma, records.map(({ id }) => id));
  const works = records.map((record) => {
    const geometry = geometries.get(record.id);
    return {
      ...record,
      geometry: geometry ?? null,
      citizenTicketReference: record.ticket,
      roadSegment: record.intervention?.segment ?? null,
      dependencyCount: record._count.dependencies,
      conflictCount: record._count.conflictLogs + record._count.conflictingLogs,
      roadConflictCount: record._count.roadConflictLogs + record._count.conflictingRoadLogs,
      audit: record.auditEvents,
      _count: undefined,
      auditEvents: undefined,
      intervention: undefined,
      ticket: undefined,
    };
  });
  return {
    works,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function listCivicWorkCalendar(actor: CivicWorkActor, query: CivicWorkCalendarQuery) {
  assertCoordinationRead(actor);
  const { records, total } = await listCivicWorkCalendarRecords(prisma, query);
  const geometries = await readCivicWorkGeometries(prisma, records.map(({ id }) => id));
  const asOf = new Date();
  const works = records.flatMap((record) => {
    const geometry = geometries.get(record.id);
    return geometry ? [calendarItem(record, geometry, asOf)] : [];
  });
  return {
    works,
    asOf,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function listCivicWorkLedger(actor: CivicWorkActor, query: CivicWorkLedgerQuery) {
  assertCoordinationRead(actor);
  const [result, location] = await Promise.all([
    listCivicWorkLedgerRecords(prisma, query),
    query.roadSegmentId
      ? prisma.roadSegment.findUnique({
        where: { id: query.roadSegmentId },
        select: { id: true, roadName: true, surfaceType: true, lastRestorationDate: true, ward: { select: { id: true, name: true } } },
      })
      : prisma.ward.findUnique({ where: { id: query.wardId! }, select: { id: true, name: true } }),
  ]);
  if (!location) throw new CivicWorkError(404, "Ledger location not found", "LEDGER_LOCATION_NOT_FOUND");
  const geometries = await readCivicWorkGeometries(prisma, result.records.map(({ id }) => id));
  const asOf = new Date();
  const works = result.records.flatMap((record) => {
    const geometry = geometries.get(record.id);
    if (!geometry) return [];
    const events: CivicWorkLedgerEvent[] = [
      ...record.stateTransitions.map((event) => ({
        id: `status:${event.id}`,
        kind: "STATUS" as const,
        title: eventTitle(event.reason),
        detail: `Status changed to ${eventTitle(event.toState)}`,
        at: event.createdAt,
        agency: record.agency,
        state: event.toState,
      })),
      ...record.evidence.map((event) => ({
        id: `evidence:${event.id}`,
        kind: "EVIDENCE" as const,
        title: `Evidence added: ${event.label}`,
        detail: eventTitle(event.kind),
        at: event.createdAt,
        agency: record.agency,
        state: null,
      })),
      ...record.auditEvents.map((event) => ({
        id: `audit:${event.id}`,
        kind: "AUDIT" as const,
        title: eventTitle(event.action),
        detail: eventDetail(event.metadata),
        at: event.createdAt,
        agency: record.agency,
        state: null,
      })),
      ...record.dependencies.flatMap((dependency) => [
        {
          id: `dependency:${dependency.id}`,
          kind: "DEPENDENCY" as const,
          title: `Coordination requested from ${dependency.respondingAgency.name}`,
          detail: dependency.requirement,
          at: dependency.createdAt,
          agency: dependency.respondingAgency,
          state: dependency.state,
        },
        ...dependency.stateTransitions.map((event) => ({
          id: `dependency-status:${event.id}`,
          kind: "DEPENDENCY" as const,
          title: `${dependency.respondingAgency.name}: ${eventTitle(event.toState)}`,
          detail: eventTitle(event.reason),
          at: event.createdAt,
          agency: dependency.respondingAgency,
          state: event.toState,
        })),
      ]),
      ...record.conflictLogs.map((event) => ({
        id: `conflict:${event.id}`,
        kind: "COORDINATION" as const,
        title: `Advisory overlap with ${event.conflictingAgency.name}`,
        detail: "Conflict warning recorded; work remains actionable.",
        at: event.createdAt,
        agency: event.conflictingAgency,
        state: "ADVISORY",
      })),
      ...record.conflictingLogs.map((event) => ({
        id: `conflicting:${event.id}`,
        kind: "COORDINATION" as const,
        title: `Advisory overlap with ${event.projectAgency.name}`,
        detail: "Conflict warning recorded; work remains actionable.",
        at: event.createdAt,
        agency: event.projectAgency,
        state: "ADVISORY",
      })),
      ...record.roadConflictLogs.map((event) => ({
        id: `road-conflict:${event.id}`,
        kind: "COORDINATION" as const,
        title: `${eventTitle(event.type)} with ${event.conflictingAgency?.name ?? "another agency"}`,
        detail: "Road-sequencing warning recorded; work remains actionable.",
        at: event.createdAt,
        agency: event.conflictingAgency,
        state: "ADVISORY",
      })),
      ...record.conflictingRoadLogs.map((event) => ({
        id: `road-conflicting:${event.id}`,
        kind: "COORDINATION" as const,
        title: `${eventTitle(event.type)} with ${event.projectAgency.name}`,
        detail: "Road-sequencing warning recorded; work remains actionable.",
        at: event.createdAt,
        agency: event.projectAgency,
        state: "ADVISORY",
      })),
    ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
    return [{ ...calendarItem(record, geometry, asOf), events }];
  });
  const normalizedLocation = "roadName" in location
    ? { kind: "ROAD" as const, id: location.id, name: location.roadName, ward: location.ward, surfaceType: location.surfaceType, lastRestorationDate: location.lastRestorationDate }
    : { kind: "WARD" as const, id: location.id, name: location.name, ward: location, surfaceType: null, lastRestorationDate: null };
  return {
    location: normalizedLocation,
    works,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
    },
  };
}

export async function updateCivicWork(actor: CivicWorkActor, id: string, input: UpdateCivicWork) {
  const agencyId = civicWorkManageAgency(actor);
  const updatedId = await prisma.$transaction(async (transaction) => {
    const current = await findCivicWork(transaction, id, { agencyId });
    if (!current) throw new CivicWorkError(404, "Civic work not found", "CIVIC_WORK_NOT_FOUND");
    const editableStates: ProjectState[] = [
      ProjectState.CREATED,
      ProjectState.TIMELINE_SET,
      ProjectState.PENDING_UPTAKE,
      ProjectState.UPTAKEN,
    ];
    if (!editableStates.includes(current.state)) {
      throw new CivicWorkError(409, `Civic work cannot be updated from ${current.state}`, "WORK_STATE_INVALID");
    }
    const categoryId = input.categoryId ?? current.categoryId;
    const wardId = input.wardId ?? current.wardId;
    if (!categoryId || !wardId) {
      throw new CivicWorkError(422, "Complete the legacy work category and ward before updating it", "WORK_REFERENCES_REQUIRED");
    }
    const plannedStart = input.proposedStart ? new Date(input.proposedStart) : current.plannedStart;
    const plannedEnd = input.proposedEnd ? new Date(input.proposedEnd) : current.plannedEnd;
    if (!plannedStart || !plannedEnd) throw new CivicWorkError(422, "A complete proposed date range is required", "INVALID_DATE_RANGE");
    assertDateRange(plannedStart, plannedEnd);
    if (input.categoryId) await assertCategoryForAgency(transaction, input.categoryId, agencyId);
    if (input.engineerId !== undefined) await assertEngineerForAgency(transaction, input.engineerId, agencyId);

    const roadCategory = await isRoadCategory(transaction, categoryId);
    if (roadCategory !== Boolean(current.intervention)) {
      throw new CivicWorkError(422, "Changing between road and non-road work requires a new registry entry", "WORK_CATEGORY_GEOMETRY_MISMATCH");
    }
    if (current.intervention && input.geometry) {
      throw new CivicWorkError(422, "Road work geometry comes from its authoritative road segment", "ROAD_GEOMETRY_READ_ONLY");
    }
    if (current.intervention && current.intervention.segment.wardId !== wardId) {
      throw new CivicWorkError(422, "The selected ward must contain the road segment", "ROAD_SEGMENT_INVALID");
    }
    const existingGeometry = (await readCivicWorkGeometries(transaction, [current.id])).get(current.id);
    const nextGeometry = input.geometry ?? existingGeometry;
    if (!current.intervention) {
      if (!nextGeometry) throw new CivicWorkError(422, "Work geometry is required", "WORK_GEOMETRY_REQUIRED");
      await assertGeometryForWard(transaction, wardId, nextGeometry);
    }

    let nextState = current.state;
    if (input.engineerId !== undefined && input.engineerId !== current.engineerId) {
      nextState = input.engineerId ? ProjectState.PENDING_UPTAKE : ProjectState.TIMELINE_SET;
    }
    const changedFields = Object.keys(input);
    await transaction.project.update({
      where: { id: current.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description, workDescription: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.wardId !== undefined ? { wardId: input.wardId } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.proposedStart !== undefined ? { plannedStart } : {}),
        ...(input.proposedEnd !== undefined ? { plannedEnd } : {}),
        ...(input.locationLabel !== undefined ? { locationLabel: input.locationLabel } : {}),
        ...(input.engineerId !== undefined ? { engineerId: input.engineerId, state: nextState } : {}),
        updatedById: actor.userId,
        auditEvents: { create: { action: "CIVIC_WORK_UPDATED", actorId: actor.userId, metadata: asInputJson({ changedFields }) } },
        ...(nextState !== current.state ? {
          stateTransitions: { create: { fromState: current.state, toState: nextState, reason: input.engineerId ? "ENGINEER_ASSIGNED" : "ENGINEER_UNASSIGNED", actedById: actor.userId } },
        } : {}),
        ...(current.intervention && (input.proposedStart || input.proposedEnd) ? {
          intervention: { update: { plannedStart, plannedEnd } },
        } : {}),
      },
    });
    if (!current.intervention && input.geometry) await writeCivicWorkGeometry(transaction, current.id, input.geometry);
    if (input.engineerId && input.engineerId !== current.engineerId) {
      await createNotification(transaction, {
        userId: input.engineerId,
        type: "PROJECT_ASSIGNMENT",
        payload: { projectId: current.id, plannedWork: true },
      });
    }
    return current.id;
  });
  return getCivicWork(actor, updatedId);
}

export async function cancelPlannedCivicWork(actor: CivicWorkActor, id: string, input: CancelCivicWork) {
  const agencyId = civicWorkManageAgency(actor);
  const cancelledId = await prisma.$transaction(async (transaction) => {
    const current = await transaction.project.findFirst({ where: { id, agencyId }, select: { id: true, origin: true, state: true } });
    if (!current) throw new CivicWorkError(404, "Civic work not found", "CIVIC_WORK_NOT_FOUND");
    if (current.origin !== CivicWorkOrigin.AGENCY_PLANNED) {
      throw new CivicWorkError(409, "Only agency-planned work can be cancelled through this endpoint", "WORK_ORIGIN_INVALID");
    }
    const cancellableStates: ProjectState[] = [ProjectState.CREATED, ProjectState.TIMELINE_SET, ProjectState.PENDING_UPTAKE];
    if (!cancellableStates.includes(current.state)) {
      throw new CivicWorkError(409, `Planned work cannot be cancelled from ${current.state}`, "WORK_STATE_INVALID");
    }
    const cancelledAt = new Date();
    await transaction.project.update({
      where: { id: current.id },
      data: {
        state: ProjectState.CANCELLED,
        cancelledAt,
        cancellationReason: input.reason,
        updatedById: actor.userId,
        stateTransitions: { create: { fromState: current.state, toState: ProjectState.CANCELLED, reason: "PLANNED_WORK_CANCELLED", actedById: actor.userId } },
        auditEvents: { create: { action: "PLANNED_WORK_CANCELLED", actorId: actor.userId, metadata: asInputJson({ reason: input.reason }) } },
      },
    });
    return current.id;
  });
  return getCivicWork(actor, cancelledId);
}
