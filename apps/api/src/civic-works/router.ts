import { Router, type NextFunction, type Request, type Response } from "express";
import { UserRole } from "db";
import {
  cancelCivicWorkSchema,
  createPlannedCivicWorkSchema,
  listCivicWorksQuerySchema,
  updateCivicWorkSchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import {
  cancelPlannedCivicWork,
  CivicWorkError,
  createPlannedCivicWork,
  getCivicWork,
  listCivicWorks,
  updateCivicWork,
  type CivicWorkActor,
} from "./service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
const idSchema = z.string().uuid();

function actor(request: Request): CivicWorkActor {
  return {
    userId: request.auth!.userId,
    role: request.auth!.role,
    agencyId: request.auth!.agencyId,
  };
}

function routeId(request: Request): string | null {
  const raw = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const parsed = idSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function createCivicWorksRouter(): Router {
  const router = Router();
  router.use("/civic-works", requireAuth, requirePasswordResetComplete);

  router.post(
    "/civic-works/planned",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      const parsed = createPlannedCivicWorkSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid planned work", details: parsed.error.flatten() });
        return;
      }
      response.status(201).json({ work: await createPlannedCivicWork(actor(request), parsed.data) });
    }),
  );

  router.get(
    "/civic-works",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    asyncRoute(async (request, response) => {
      const parsed = listCivicWorksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid civic work filters", details: parsed.error.flatten() });
        return;
      }
      response.json(await listCivicWorks(actor(request), parsed.data));
    }),
  );

  router.get(
    "/civic-works/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    asyncRoute(async (request, response) => {
      const id = routeId(request);
      if (!id) {
        response.status(400).json({ error: "Invalid civic work id" });
        return;
      }
      response.json({ work: await getCivicWork(actor(request), id) });
    }),
  );

  router.patch(
    "/civic-works/:id",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      const id = routeId(request);
      const parsed = updateCivicWorkSchema.safeParse(request.body);
      if (!id || !parsed.success) {
        response.status(400).json({ error: "Invalid civic work update", ...(!parsed.success ? { details: parsed.error.flatten() } : {}) });
        return;
      }
      response.json({ work: await updateCivicWork(actor(request), id, parsed.data) });
    }),
  );

  router.post(
    "/civic-works/:id/cancel",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      const id = routeId(request);
      const parsed = cancelCivicWorkSchema.safeParse(request.body);
      if (!id || !parsed.success) {
        response.status(400).json({ error: "Invalid planned work cancellation", ...(!parsed.success ? { details: parsed.error.flatten() } : {}) });
        return;
      }
      response.json({ work: await cancelPlannedCivicWork(actor(request), id, parsed.data) });
    }),
  );

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof CivicWorkError) {
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  });
  return router;
}
