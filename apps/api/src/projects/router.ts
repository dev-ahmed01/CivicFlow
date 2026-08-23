import { Router, type NextFunction, type Request, type Response } from "express";
import { ProjectState, TicketState, UserRole, prisma } from "db";
import { createProjectSchema, projectStateSchema } from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function projectHeadAgency(request: Request): string {
  const agencyId = request.auth?.agencyId;
  if (!agencyId) throw new Error("Project Head account is missing an agency assignment");
  return agencyId;
}

export function createProjectsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/projects",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid project", details: parsed.error.flatten() });
        return;
      }
      const agencyId = projectHeadAgency(request);
      const engineer = await prisma.user.findFirst({
        where: { id: parsed.data.engineerId, agencyId, role: UserRole.ENGINEER },
        select: { id: true },
      });
      if (!engineer) {
        response.status(422).json({ error: "Choose an Executive Engineer from your agency roster" });
        return;
      }

      const project = await prisma.$transaction(async (transaction) => {
        // Part III §17.2 — lock and scope the ticket before any state mutation.
        const rows = await transaction.$queryRaw<Array<{ id: string; state: TicketState; assignedAgencyId: string | null }>>`
          SELECT "id", "state", "assignedAgencyId" FROM "Ticket"
          WHERE "id" = ${parsed.data.ticketId}::uuid FOR UPDATE
        `;
        const ticket = rows[0];
        if (!ticket || ticket.assignedAgencyId !== agencyId) return { kind: "missing" as const };
        if (ticket.state !== TicketState.INSPECTION_COMPLETE) return { kind: "state" as const, state: ticket.state };

        const created = await transaction.project.create({
          data: {
            ticketId: ticket.id,
            agencyId,
            engineerId: engineer.id,
            // W-P6 — Phase 6 advances this state when the Engineer accepts.
            state: ProjectState.CREATED,
          },
          include: {
            engineer: { select: { id: true, email: true } },
            ticket: { select: { id: true, title: true } },
          },
        });
        await transaction.ticket.update({ where: { id: ticket.id }, data: { state: TicketState.ENGINEER_ASSIGNED } });
        await transaction.ticketStateTransition.createMany({
          data: [
            { ticketId: ticket.id, fromState: TicketState.INSPECTION_COMPLETE, toState: TicketState.PROJECT_CREATED, reason: "PROJECT_CREATED" },
            { ticketId: ticket.id, fromState: TicketState.PROJECT_CREATED, toState: TicketState.ENGINEER_ASSIGNED, reason: "ENGINEER_ASSIGNED" },
          ],
        });
        await transaction.notification.create({
          data: { userId: engineer.id, type: "PROJECT_ASSIGNMENT", payload: { projectId: created.id, ticketId: ticket.id } },
        });
        return { kind: "created" as const, project: created };
      });

      if (project.kind === "missing") {
        response.status(404).json({ error: "Ticket not found" });
        return;
      }
      if (project.kind === "state") {
        response.status(409).json({ error: `Project cannot be created from ${project.state}` });
        return;
      }
      response.status(201).json({ project: project.project });
    }),
  );

  router.get(
    "/projects/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const id = idSchema.safeParse(routeId(request));
      if (!id.success) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      const project = await prisma.project.findFirst({
        where: {
          id: id.data,
          ...(request.auth!.role === UserRole.PROJECT_HEAD ? { agencyId: projectHeadAgency(request) } : {}),
        },
        include: {
          agency: { select: { id: true, name: true } },
          engineer: { select: { id: true, email: true } },
          ticket: { include: { category: { select: { id: true, name: true } }, ward: { select: { id: true, name: true } } } },
        },
      });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      response.json({ project });
    }),
  );

  router.get(
    "/projects",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ADMIN),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const status = request.query.status ? projectStateSchema.safeParse(request.query.status) : null;
      const agency = request.query.agency ? idSchema.safeParse(request.query.agency) : null;
      const ward = request.query.ward ? idSchema.safeParse(request.query.ward) : null;
      if ((status && !status.success) || (agency && !agency.success) || (ward && !ward.success)) {
        response.status(400).json({ error: "Invalid project filter" });
        return;
      }
      const scopedAgency = request.auth!.role === UserRole.PROJECT_HEAD
        ? projectHeadAgency(request)
        : agency?.success ? agency.data : undefined;
      if (request.auth!.role === UserRole.PROJECT_HEAD && agency?.success && agency.data !== scopedAgency) {
        response.status(403).json({ error: "Cannot view another agency's projects" });
        return;
      }
      const projects = await prisma.project.findMany({
        where: {
          ...(scopedAgency ? { agencyId: scopedAgency } : {}),
          ...(status?.success ? { state: status.data } : {}),
          ...(ward?.success ? { ticket: { wardId: ward.data } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          agency: { select: { id: true, name: true } },
          engineer: { select: { id: true, email: true } },
          ticket: { select: { id: true, title: true, ward: { select: { id: true, name: true } } } },
        },
      });
      response.json({ projects });
    }),
  );

  return router;
}
