import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { DependencyState, ProjectState, TicketState, UserRole, prisma } from "db";
import {
  agencyOriginatedTicketRequestSchema,
  inspectionReportRequestSchema,
  ticketStateSchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import type { ImageStorage } from "../images/storage";
import { checkProjectConflicts } from "../conflicts/service";
import { checkRoadConflicts, isRoadCategory } from "../road-intelligence/service";
import { buildProjectHeadPerformance } from "../analytics/service";
import { paginationMeta, parsePagination } from "../http/pagination";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function projectHeadAgency(request: Request): string {
  const agencyId = request.auth?.agencyId;
  if (!agencyId) throw new Error("Project Head account is missing an agency assignment");
  return agencyId;
}

async function ownsTicket(request: Request, ticketId: string): Promise<boolean> {
  const agencyId = projectHeadAgency(request);
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, assignedAgencyId: agencyId }, select: { id: true } });
  return Boolean(ticket);
}

export function createAgencyRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/project-head/dashboard",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const agencyId = projectHeadAgency(request);
      const [agency, newValidatedTickets, inspectionsDue, dependencyRequestsPending, activeProjects, analytics] = await Promise.all([
        prisma.agency.findUniqueOrThrow({ where: { id: agencyId }, select: { id: true, name: true } }),
        prisma.ticket.count({ where: { assignedAgencyId: agencyId, state: TicketState.ROUTED_TO_AGENCY } }),
        prisma.ticket.count({ where: { assignedAgencyId: agencyId, state: TicketState.INSPECTION_DUE } }),
        prisma.dependency.count({
          where: {
            respondingAgencyId: agencyId,
            state: { in: [DependencyState.REQUESTED, DependencyState.PENDING_RESPONSE] },
          },
        }),
        prisma.project.count({
          where: { agencyId, state: { notIn: [ProjectState.CLOSED, ProjectState.CANCELLED] } },
        }),
        buildProjectHeadPerformance(agencyId),
      ]);
      response.json({
        agency,
        counts: { newValidatedTickets, inspectionsDue, dependencyRequestsPending, activeProjects },
        performance: {
          ...analytics,
        },
      });
    }),
  );

  router.get(
    "/project-head/engineers",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const engineers = await prisma.user.findMany({
        where: { agencyId: projectHeadAgency(request), role: UserRole.ENGINEER },
        orderBy: { email: "asc" },
        select: { id: true, email: true },
      });
      response.json({ engineers });
    }),
  );

  router.get(
    "/agencies",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (_request, response) => {
      response.json({
        agencies: await prisma.agency.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
      });
    }),
  );

  router.get(
    "/wards",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (_request, response) => {
      response.json({ wards: await prisma.ward.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) });
    }),
  );

  router.get(
    "/tickets",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const status = request.query.status ? ticketStateSchema.safeParse(request.query.status) : null;
      const category = request.query.category ? idSchema.safeParse(request.query.category) : null;
      const ward = request.query.ward ? idSchema.safeParse(request.query.ward) : null;
      const pagination = parsePagination(request.query);
      if (status && !status.success || category && !category.success || ward && !ward.success || !pagination.success) {
        response.status(400).json({ error: "Invalid ticket filter" });
        return;
      }
      const agencyId = request.auth!.role === UserRole.PROJECT_HEAD ? projectHeadAgency(request) : undefined;
      const where = {
          ...(agencyId ? { assignedAgencyId: agencyId } : {}),
          ...(status?.success ? { state: status.data } : {}),
          ...(category?.success ? { categoryId: category.data } : {}),
          ...(ward?.success ? { wardId: ward.data } : {}),
      };
      const [tickets, total] = await Promise.all([prisma.ticket.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.data.skip,
        take: pagination.data.limit,
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          state: true,
          createdAt: true,
          category: { select: { id: true, name: true } },
          ward: { select: { id: true, name: true } },
          stateTransitions: {
            where: { toState: TicketState.VALIDATED },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }), prisma.ticket.count({ where })]);
      response.json({
        tickets: tickets.map(({ stateTransitions, ...ticket }) => ({
          ...ticket,
          validatedAt: stateTransitions[0]?.createdAt ?? null,
          inspectionDue: ticket.state === TicketState.INSPECTION_DUE,
        })),
        pagination: paginationMeta(pagination.data.page, pagination.data.limit, total),
      });
    }),
  );

  router.post(
    "/tickets/agency-originated",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = agencyOriginatedTicketRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid agency-originated ticket", details: parsed.error.flatten() });
        return;
      }

      if (parsed.data.action === "complete") {
        const image = await prisma.image.findFirst({
          where: {
            id: parsed.data.imageId,
            observation: {
              submitterId: request.auth!.userId,
              ticket: { reporterId: null, assignedAgencyId: projectHeadAgency(request) },
            },
          },
          select: { id: true, observation: { select: { ticketId: true } } },
        });
        if (!image) {
          response.status(404).json({ error: "Evidence upload not found" });
          return;
        }
        await prisma.image.update({ where: { id: image.id }, data: { uploadedAt: new Date() } });
        response.json({ ticketId: image.observation.ticketId, imageId: image.id, uploaded: true });
        return;
      }

      const input = parsed.data;
      const agencyId = projectHeadAgency(request);
      const [category, ward] = await Promise.all([
        prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true, name: true } }),
        prisma.ward.findUnique({ where: { id: input.wardId }, select: { id: true, name: true } }),
      ]);
      if (!category || !ward) {
        response.status(422).json({ error: "Choose an available category and ward" });
        return;
      }
      const roadCategory = await isRoadCategory(prisma, category.id);
      if (roadCategory !== Boolean(input.intervention)) {
        response.status(422).json({ error: roadCategory
          ? "Road Damage work requires road-segment intervention details"
          : "Intervention details are only available for the configured Road Damage category" });
        return;
      }
      if (input.intervention) {
        const segment = await prisma.roadSegment.findFirst({ where: { id: input.intervention.segmentId, wardId: ward.id }, select: { id: true } });
        if (!segment) {
          response.status(422).json({ error: "Choose a road segment in the selected ward" });
          return;
        }
        const referenceCount = await prisma.intervention.count({ where: { id: { in: input.intervention.dependencyRefs }, segmentId: segment.id } });
        if (referenceCount !== new Set(input.intervention.dependencyRefs).size) {
          response.status(422).json({ error: "Every intervention dependency must reference work on the same road segment" });
          return;
        }
      }
      if (input.location) {
        const contained = await prisma.$queryRaw<Array<{ covered: boolean }>>`
          SELECT ST_Covers("boundary", ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326)) AS "covered"
          FROM "Ward" WHERE "id" = ${ward.id}::uuid
        `;
        if (!contained[0]?.covered) {
          response.status(422).json({ error: "The selected location is outside the selected ward" });
          return;
        }
      }

      const ticketId = randomUUID();
      const observationId = randomUUID();
      const imageId = randomUUID();
      const objectKey = `agency-tickets/${ticketId}/${imageId}-${safeFileName(input.evidence.fileName)}`;
      const upload = storage.createUpload(objectKey, input.evidence.contentType);
      const title = `${category.name}: ${input.description}`.slice(0, 160);
      const address = input.location?.address ?? `${ward.name}, Bengaluru`;
      const result = await prisma.$transaction(async (transaction) => {
        if (input.location) {
          await transaction.$executeRaw`
            INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt")
            VALUES (${ticketId}::uuid, ${category.id}::uuid, NULL, ${agencyId}::uuid,
              ST_SetSRID(ST_MakePoint(${input.location.longitude}, ${input.location.latitude}), 4326), ${ward.id}::uuid,
              ${TicketState.ROUTED_TO_AGENCY}::"TicketState", ${title}, ${address}, NOW())
          `;
        } else {
          await transaction.$executeRaw`
            INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt")
            SELECT ${ticketId}::uuid, ${category.id}::uuid, NULL, ${agencyId}::uuid,
              ST_PointOnSurface("boundary"), "id", ${TicketState.ROUTED_TO_AGENCY}::"TicketState", ${title}, ${address}, NOW()
            FROM "Ward" WHERE "id" = ${ward.id}::uuid
          `;
        }
        await transaction.observation.create({
          data: {
            id: observationId,
            ticketId,
            submitterId: request.auth!.userId,
            imageUrl: upload.publicUrl,
            note: input.description,
            latitude: input.location?.latitude,
            longitude: input.location?.longitude,
            address,
          },
        });
        await transaction.image.create({
          data: { id: imageId, observationId, url: upload.publicUrl, objectKey, isPrimary: true },
        });
        // Part II W-P9 — no citizen validation transitions are synthesized.
        await transaction.ticketStateTransition.create({
          data: { ticketId, fromState: null, toState: TicketState.ROUTED_TO_AGENCY, reason: "AGENCY_ORIGINATED" },
        });
        if (!input.intervention) return { projectId: null, conflicts: [], roadConflicts: [] };

        const intervention = input.intervention;
        const project = await transaction.project.create({
          data: {
            ticketId,
            agencyId,
            state: ProjectState.CREATED,
            plannedStart: new Date(intervention.plannedStart),
            plannedEnd: new Date(intervention.plannedEnd),
            stateTransitions: { create: { fromState: null, toState: ProjectState.CREATED, reason: "PLANNED_INTERVENTION_CREATED", actedById: request.auth!.userId } },
            intervention: { create: {
              segmentId: intervention.segmentId,
              requestingAgencyId: agencyId,
              purpose: intervention.purpose,
              plannedStart: new Date(intervention.plannedStart),
              plannedEnd: new Date(intervention.plannedEnd),
              affectedLengthM: intervention.affectedLengthM,
              startOffsetM: intervention.startOffsetM,
              dependencyRefs: intervention.dependencyRefs,
            } },
          },
        });
        await transaction.ticket.update({ where: { id: ticketId }, data: { state: TicketState.PROJECT_CREATED, roadSegmentId: intervention.segmentId } });
        await transaction.ticketStateTransition.create({ data: { ticketId, fromState: TicketState.ROUTED_TO_AGENCY, toState: TicketState.PROJECT_CREATED, reason: "PLANNED_INTERVENTION_CREATED" } });
        // Delta §4.3 — the unchanged Phase 7 engine runs before road-specific checks.
        const conflicts = await checkProjectConflicts(transaction, project.id);
        const roadConflicts = await checkRoadConflicts(transaction, project.id);
        return { projectId: project.id, conflicts, roadConflicts };
      });
      response.status(201).json({ ticketId, imageId, upload, state: input.intervention ? TicketState.PROJECT_CREATED : TicketState.ROUTED_TO_AGENCY, ...result });
    }),
  );

  router.post(
    "/tickets/:id/inspection-report",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = inspectionReportRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid inspection report", details: parsed.error.flatten() });
        return;
      }
      const ticketId = routeId(request);
      if (!(await ownsTicket(request, ticketId))) {
        response.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (parsed.data.action === "presign") {
        const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { state: true } });
        if (ticket.state !== TicketState.ROUTED_TO_AGENCY && ticket.state !== TicketState.INSPECTION_DUE) {
          response.status(409).json({ error: `Inspection cannot be opened from ${ticket.state}` });
          return;
        }
        const input = parsed.data;
        const reportId = randomUUID();
        const objectKey = `inspection-reports/${ticketId}/${reportId}-${safeFileName(input.fileName)}`;
        const upload = storage.createUpload(objectKey, input.contentType);
        await prisma.$transaction(async (transaction) => {
          if (ticket.state === TicketState.ROUTED_TO_AGENCY) {
            await transaction.ticket.update({ where: { id: ticketId }, data: { state: TicketState.INSPECTION_DUE } });
            await transaction.ticketStateTransition.create({
              data: { ticketId, fromState: ticket.state, toState: TicketState.INSPECTION_DUE, reason: "INSPECTION_OPENED" },
            });
          }
          await transaction.inspectionReport.create({
            data: {
              id: reportId,
              ticketId,
              submittedById: request.auth!.userId,
              fileUrl: upload.publicUrl,
              objectKey,
              contentType: input.contentType,
              notes: input.notes,
            },
          });
        });
        response.status(201).json({ reportId, upload, state: TicketState.INSPECTION_DUE });
        return;
      }

      const report = await prisma.inspectionReport.findFirst({
        where: { id: parsed.data.reportId, ticketId, submittedById: request.auth!.userId },
        select: { id: true },
      });
      if (!report) {
        response.status(404).json({ error: "Inspection report not found" });
        return;
      }
      const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { state: true } });
      if (ticket.state !== TicketState.INSPECTION_DUE) {
        response.status(409).json({ error: `Inspection cannot be completed from ${ticket.state}` });
        return;
      }
      await prisma.$transaction([
        prisma.inspectionReport.update({ where: { id: report.id }, data: { uploadedAt: new Date() } }),
        prisma.ticket.update({ where: { id: ticketId }, data: { state: TicketState.INSPECTION_COMPLETE } }),
        prisma.ticketStateTransition.create({
          data: { ticketId, fromState: TicketState.INSPECTION_DUE, toState: TicketState.INSPECTION_COMPLETE, reason: "INSPECTION_COMPLETE" },
        }),
      ]);
      response.json({ reportId: report.id, ticketId, state: TicketState.INSPECTION_COMPLETE });
    }),
  );

  return router;
}
