import {
  CivicWorkOrigin,
  Prisma,
  ProjectState,
  UserRole,
  prisma,
} from "db";
import type {
  CancelCivicWork,
  CivicWorkGeometry,
  CreatePlannedCivicWork,
  ListCivicWorksQuery,
  UpdateCivicWork,
  UserRole as SharedUserRole,
} from "@civicos/shared";
import { createNotification } from "../notifications/service";
import { isRoadCategory } from "../road-intelligence/service";
import {
  copyRoadSegmentGeometry,
  findCivicWork,
  geometryIsCoveredByWard,
  listCivicWorkRecords,
  readCivicWorkGeometries,
  writeCivicWorkGeometry,
  type CivicWorkClient,
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
