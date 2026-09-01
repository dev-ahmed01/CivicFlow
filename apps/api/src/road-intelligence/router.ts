import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, ProjectState, UserRole, prisma } from "db";
import { sequencingRecommendationActionSchema, type ProjectConflict, type RoadConflict } from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { checkProjectConflicts } from "../conflicts/service";
import { createNotifications } from "../notifications/service";
import { checkRoadConflicts, isRoadCategory, recommendationsForSegment } from "./service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();
const segmentQuerySchema = z.object({ query: z.string().trim().max(120).optional(), ward: idSchema.optional() });
const linkTicketSchema = z.object({ segmentId: idSchema.nullable() });

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function actorAgency(request: Request): string {
  const agencyId = request.auth?.agencyId;
  if (!agencyId) throw new Error("Internal account is missing an agency assignment");
  return agencyId;
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function createRoadIntelligenceRouter(): Router {
  const router = Router();
  router.use(requireAuth, requirePasswordResetComplete);

  router.get(
    "/road-segments",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    asyncRoute(async (request, response) => {
      const parsed = segmentQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid road-segment search" });
        return;
      }
      const segments = await prisma.roadSegment.findMany({
        where: {
          ...(parsed.data.query ? { roadName: { contains: parsed.data.query, mode: "insensitive" } } : {}),
          ...(parsed.data.ward ? { wardId: parsed.data.ward } : {}),
        },
        orderBy: [{ roadName: "asc" }, { id: "asc" }],
        take: 50,
        select: { id: true, roadName: true, wardId: true, surfaceType: true, lastRestorationDate: true, ward: { select: { id: true, name: true } } },
      });
      response.json({ segments });
    }),
  );

  router.get(
    "/road-segments/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    asyncRoute(async (request, response) => {
      const id = idSchema.safeParse(routeId(request));
      if (!id.success) {
        response.status(404).json({ error: "Road segment not found" });
        return;
      }
      const segment = await prisma.roadSegment.findUnique({
        where: { id: id.data },
        select: {
          id: true,
          roadName: true,
          wardId: true,
          surfaceType: true,
          lastRestorationDate: true,
          ward: { select: { id: true, name: true } },
          interventions: {
            orderBy: [{ plannedStart: "desc" }, { createdAt: "desc" }],
            include: {
              requestingAgency: { select: { id: true, name: true } },
              project: { select: { id: true, state: true, ticket: { select: { id: true, title: true } } } },
            },
          },
        },
      });
      if (!segment) {
        response.status(404).json({ error: "Road segment not found" });
        return;
      }
      response.json({
        segment: { id: segment.id, roadName: segment.roadName, wardId: segment.wardId, surfaceType: segment.surfaceType, lastRestorationDate: segment.lastRestorationDate, ward: segment.ward },
        interventionHistory: segment.interventions.map((item) => ({ ...item, dependencyRefs: jsonStringArray(item.dependencyRefs) })),
      });
    }),
  );

  router.patch(
    "/tickets/:id/road-segment",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      const parsed = linkTicketSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid road-segment link" });
        return;
      }
      const ticket = await prisma.ticket.findFirst({
        where: { id: routeId(request), assignedAgencyId: actorAgency(request) },
        select: { id: true, categoryId: true, wardId: true },
      });
      if (!ticket) {
        response.status(404).json({ error: "Ticket not found" });
        return;
      }
      if (!(await isRoadCategory(prisma, ticket.categoryId))) {
        response.status(422).json({ error: "Only the configured Road Damage category can link a road segment" });
        return;
      }
      if (parsed.data.segmentId) {
        const segment = await prisma.roadSegment.findFirst({ where: { id: parsed.data.segmentId, wardId: ticket.wardId }, select: { id: true } });
        if (!segment) {
          response.status(422).json({ error: "Choose a road segment in the ticket ward" });
          return;
        }
      }
      const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { roadSegmentId: parsed.data.segmentId }, select: { id: true, roadSegmentId: true } });
      response.json({ ticket: updated });
    }),
  );

  router.get(
    "/projects/:id/road-intelligence",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    asyncRoute(async (request, response) => {
      const project = await prisma.project.findFirst({
        where: {
          id: routeId(request),
          agencyId: actorAgency(request),
          ...(request.auth!.role === UserRole.ENGINEER ? { engineerId: request.auth!.userId } : {}),
        },
        select: { id: true, intervention: { select: { segmentId: true } } },
      });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      if (!project.intervention) {
        response.json({ conflicts: [], recommendations: [], segment: null, interventionHistory: [] });
        return;
      }
      const conflicts = await checkRoadConflicts(prisma, project.id);
      const segment = await prisma.roadSegment.findUniqueOrThrow({
        where: { id: project.intervention.segmentId },
        select: {
          id: true,
          roadName: true,
          wardId: true,
          surfaceType: true,
          lastRestorationDate: true,
          ward: { select: { id: true, name: true } },
          interventions: {
            orderBy: [{ plannedStart: "desc" }, { createdAt: "desc" }],
            include: { requestingAgency: { select: { id: true, name: true } }, project: { select: { id: true, state: true, ticket: { select: { id: true, title: true } } } } },
          },
        },
      });
      response.json({
        conflicts,
        recommendations: await recommendationsForSegment(prisma, segment.id),
        segment: { id: segment.id, roadName: segment.roadName, wardId: segment.wardId, surfaceType: segment.surfaceType, lastRestorationDate: segment.lastRestorationDate, ward: segment.ward },
        interventionHistory: segment.interventions.map((item) => ({ ...item, dependencyRefs: jsonStringArray(item.dependencyRefs) })),
      });
    }),
  );

  router.post(
    "/sequencing-recommendations/:id/actions",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      const parsed = sequencingRecommendationActionSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid recommendation action", details: parsed.error.flatten() });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const recommendation = await transaction.sequencingRecommendation.findUnique({ where: { id: routeId(request) } });
        if (!recommendation) return { kind: "missing" as const };
        const projectIds = jsonStringArray(recommendation.projectIds);
        const ownedProjects = await transaction.project.findMany({
          where: { id: { in: projectIds }, agencyId: actorAgency(request) },
          select: { id: true, state: true, plannedStart: true, plannedEnd: true },
        });
        if (ownedProjects.length === 0) return { kind: "missing" as const };

        const order = parsed.data.proposedOrder ?? recommendation.proposedOrder;
        let revisedProjectId: string | null = null;
        if (parsed.data.timelineRevision) {
          const owned = ownedProjects.find((item) => item.id === parsed.data.timelineRevision!.projectId);
          if (!owned) return { kind: "forbidden" as const };
          const start = new Date(parsed.data.timelineRevision.plannedStart);
          const end = new Date(parsed.data.timelineRevision.plannedEnd);
          revisedProjectId = owned.id;
          await transaction.project.update({ where: { id: owned.id }, data: { plannedStart: start, plannedEnd: end, ...(owned.state === ProjectState.ACTIVE ? { state: ProjectState.MODIFIED } : {}) } });
          await transaction.intervention.update({ where: { projectId: owned.id }, data: { plannedStart: start, plannedEnd: end } });
          // Phase 4 — the calendar shows the revision while this immutable
          // audit payload preserves the originally proposed dates.
          await transaction.projectAuditEvent.create({ data: {
            projectId: owned.id,
            action: "SEQUENCING_TIMELINE_REVISED",
            actorId: request.auth!.userId,
            metadata: {
              sequencingRecommendationId: recommendation.id,
              outcome: parsed.data.outcome,
              originalPlannedStart: owned.plannedStart?.toISOString() ?? null,
              originalPlannedEnd: owned.plannedEnd?.toISOString() ?? null,
              revisedPlannedStart: start.toISOString(),
              revisedPlannedEnd: end.toISOString(),
            },
          } });
          if (owned.state === ProjectState.ACTIVE) {
            await transaction.projectStateTransition.create({ data: { projectId: owned.id, fromState: ProjectState.ACTIVE, toState: ProjectState.MODIFIED, reason: `SEQUENCING_RECOMMENDATION_${parsed.data.outcome}`, actedById: request.auth!.userId } });
          }
        }
        const log = await transaction.sequencingRecommendationLog.create({ data: {
          recommendationId: recommendation.id,
          segmentId: recommendation.segmentId,
          proposedOrder: JSON.parse(JSON.stringify(order)) as Prisma.InputJsonValue,
          outcome: parsed.data.outcome,
          actedById: request.auth!.userId,
        } });

        const involvedProjects = await transaction.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, agencyId: true, engineerId: true },
        });
        const involvedUsers = await transaction.user.findMany({
          where: {
            id: { not: request.auth!.userId },
            OR: [
              { role: UserRole.PROJECT_HEAD, agencyId: { in: [...new Set(involvedProjects.map(({ agencyId }) => agencyId))] } },
              { role: UserRole.ENGINEER, id: { in: involvedProjects.flatMap(({ engineerId }) => engineerId ? [engineerId] : []) } },
            ],
          },
          select: { id: true, agencyId: true },
        });
        await createNotifications(transaction, involvedUsers.map((user) => ({
          userId: user.id,
          type: "SEQUENCE_CHANGED",
          payload: {
            sequencingRecommendationId: recommendation.id,
            segmentId: recommendation.segmentId,
            projectId: involvedProjects.find((project) => project.agencyId === user.agencyId || project.engineerId === user.id)?.id ?? revisedProjectId ?? projectIds[0] ?? null,
            outcome: parsed.data.outcome,
          },
        })));

        let genericConflicts: ProjectConflict[] = [];
        let roadConflicts: RoadConflict[] = [];
        if (revisedProjectId) {
          // Delta §4.3 — Phase 7 runs first; road intelligence is additive.
          genericConflicts = await checkProjectConflicts(transaction, revisedProjectId);
          roadConflicts = await checkRoadConflicts(transaction, revisedProjectId);
        }
        return { kind: "acted" as const, log, genericConflicts, roadConflicts, segmentId: recommendation.segmentId };
      });
      if (result.kind === "missing") response.status(404).json({ error: "Recommendation not found" });
      else if (result.kind === "forbidden") response.status(403).json({ error: "A Project Head may revise only their agency's project" });
      else response.json({ log: result.log, genericConflicts: result.genericConflicts, roadConflicts: result.roadConflicts, recommendations: await recommendationsForSegment(prisma, result.segmentId) });
    }),
  );

  return router;
}
