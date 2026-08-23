import { Router, type NextFunction, type Request, type Response } from "express";
import { DependencyState, UserRole, prisma } from "db";
import {
  createDependencyRequestsSchema,
  dependencyDirectionSchema,
  dependencyResponseSchema,
  dependencyStateSchema,
} from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import {
  createDependencyRequests,
  DependencyActionError,
  respondToDependency,
  runDependencyEscalationJob,
} from "./service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function agencyId(request: Request): string {
  const id = request.auth?.agencyId;
  if (!id) throw new DependencyActionError("This account is missing an agency assignment", 403);
  return id;
}
function handleActionError(error: unknown, response: Response): boolean {
  if (!(error instanceof DependencyActionError)) return false;
  response.status(error.status).json({ error: error.message });
  return true;
}

export function createDependenciesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/projects/:id/dependencies",
    requireRole(UserRole.PROJECT_HEAD),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = createDependencyRequestsSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid dependency request", details: parsed.error.flatten() });
        return;
      }
      const projectId = routeId(request);
      const requesterAgencyId = agencyId(request);
      const project = await prisma.project.findFirst({ where: { id: projectId, agencyId: requesterAgencyId }, select: { id: true } });
      if (!project) {
        response.status(404).json({ error: "Project not found" });
        return;
      }
      try {
        const dependencies = await prisma.$transaction((transaction) => createDependencyRequests(
          transaction,
          project.id,
          requesterAgencyId,
          parsed.data.dependencies,
          request.auth!.userId,
        ));
        response.status(201).json({ dependencies });
      } catch (error) {
        if (!handleActionError(error, response)) throw error;
      }
    }),
  );

  router.get(
    "/dependencies",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const direction = dependencyDirectionSchema.safeParse(request.query.direction);
      const status = request.query.status ? dependencyStateSchema.safeParse(request.query.status) : null;
      if (!direction.success || status && !status.success) {
        response.status(400).json({ error: "direction must be sent or received and status must be valid" });
        return;
      }
      const scopedAgencyId = agencyId(request);
      const dependencies = await prisma.dependency.findMany({
        where: {
          ...(direction.data === "sent" ? { requestingAgencyId: scopedAgencyId } : { respondingAgencyId: scopedAgencyId }),
          ...(status?.success ? { state: status.data } : {}),
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
        include: {
          project: { select: { id: true, ticket: { select: { id: true, title: true } } } },
          requestingAgency: true,
          respondingAgency: {
            include: {
              users: {
                where: { role: UserRole.PROJECT_HEAD, email: { not: null } },
                select: { email: true },
                orderBy: { email: "asc" },
              },
            },
          },
          assignedEngineer: { select: { id: true, email: true } },
        },
      });
      response.json({
        dependencies: dependencies.map(({ respondingAgency, ...dependency }) => ({
          ...dependency,
          respondingAgency: { id: respondingAgency.id, name: respondingAgency.name, type: respondingAgency.type },
          // Part III §12 — contact details surface only after escalation and only
          // to the requesting agency through the sent scope.
          contacts: direction.data === "sent" && dependency.state === DependencyState.ESCALATED
            ? respondingAgency.users.flatMap(({ email }) => email ? [{ email }] : [])
            : [],
        })),
      });
    }),
  );

  router.post(
    "/dependencies/:id/respond",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    requirePasswordResetComplete,
    asyncRoute(async (request, response) => {
      const parsed = dependencyResponseSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid dependency response", details: parsed.error.flatten() });
        return;
      }
      try {
        const dependency = await respondToDependency(routeId(request), {
          userId: request.auth!.userId,
          role: request.auth!.role,
          agencyId: request.auth!.agencyId,
        }, parsed.data);
        response.json({ dependency });
      } catch (error) {
        if (!handleActionError(error, response)) throw error;
      }
    }),
  );

  return router;
}

export function createDependencyJobsRouter(cronSecret?: string): Router {
  const router = Router();
  router.post("/internal/jobs/dependency-escalation", asyncRoute(async (request, response) => {
    if (!cronSecret) {
      response.status(503).json({ error: "Dependency scheduler is not configured" });
      return;
    }
    if (request.header("authorization") !== `Bearer ${cronSecret}`) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    response.json(await runDependencyEscalationJob());
  }));
  return router;
}
