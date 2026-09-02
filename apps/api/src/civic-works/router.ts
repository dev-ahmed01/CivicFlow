import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { UserRole, prisma } from "db";
import {
  cancelCivicWorkSchema,
  civicWorkCalendarQuerySchema,
  civicWorkLedgerQuerySchema,
  civicWorkEvidenceRequestSchema,
  createPlannedCivicWorkSchema,
  listCivicWorksQuerySchema,
  nearbyCivicWorksQuerySchema,
  updateCivicWorkSchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import type { ImageStorage } from "../images/storage";
import {
  cancelPlannedCivicWork,
  CivicWorkError,
  createPlannedCivicWork,
  getCivicWork,
  listCivicWorkCalendar,
  listCivicWorkLedger,
  listCivicWorks,
  listNearbyCivicWorks,
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

function safeFileName(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120); }

export function createCivicWorksRouter(storage: ImageStorage): Router {
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
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
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
    "/civic-works/calendar",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    asyncRoute(async (request, response) => {
      const parsed = civicWorkCalendarQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid work calendar filters", details: parsed.error.flatten() });
        return;
      }
      response.json(await listCivicWorkCalendar(actor(request), parsed.data));
    }),
  );

  router.get(
    "/civic-works/ledger",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
    asyncRoute(async (request, response) => {
      const parsed = civicWorkLedgerQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid work ledger location", details: parsed.error.flatten() });
        return;
      }
      response.json(await listCivicWorkLedger(actor(request), parsed.data));
    }),
  );

  router.get(
    "/civic-works/nearby",
    requireRole(UserRole.CITIZEN),
    asyncRoute(async (request, response) => {
      const parsed = nearbyCivicWorksQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid nearby works location", details: parsed.error.flatten() });
        return;
      }
      response.json(await listNearbyCivicWorks(actor(request), parsed.data));
    }),
  );

  router.get(
    "/civic-works/:id",
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER),
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

  router.post("/civic-works/:id/evidence", requireRole(UserRole.PROJECT_HEAD), asyncRoute(async (request, response) => {
    const id = routeId(request);
    const parsed = civicWorkEvidenceRequestSchema.safeParse(request.body);
    if (!id || !parsed.success) { response.status(400).json({ error: "Invalid planning evidence", ...(!parsed.success ? { details: parsed.error.flatten() } : {}) }); return; }
    const work = await prisma.project.findFirst({ where: { id, agencyId: actor(request).agencyId ?? "" }, select: { id: true } });
    if (!work) { response.status(404).json({ error: "Agency civic work not found" }); return; }
    if (parsed.data.action === "presign") {
      const evidenceId = randomUUID();
      const objectKey = `civic-work-evidence/${id}/${evidenceId}-${safeFileName(parsed.data.fileName)}`;
      const upload = await storage.createUpload(objectKey, parsed.data.contentType);
      await prisma.projectEvidence.create({ data: { id: evidenceId, projectId: id, createdById: actor(request).userId, kind: parsed.data.kind, label: parsed.data.label, url: upload.publicUrl, objectKey, contentType: parsed.data.contentType } });
      response.status(201).json({ evidenceId, upload }); return;
    }
    const evidence = await prisma.projectEvidence.findFirst({ where: { id: parsed.data.evidenceId, projectId: id, createdById: actor(request).userId, uploadedAt: null }, select: { id: true, objectKey: true, contentType: true } });
    if (!evidence?.objectKey || !evidence.contentType) { response.status(404).json({ error: "Pending planning evidence not found" }); return; }
    if (!(await storage.verifyUpload(evidence.objectKey, evidence.contentType))) { response.status(422).json({ error: "The planning evidence is missing or invalid" }); return; }
    await prisma.projectEvidence.update({ where: { id: evidence.id }, data: { uploadedAt: new Date() } });
    response.json({ evidenceId: evidence.id, uploaded: true });
  }));

  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (error instanceof CivicWorkError) {
      response.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  });
  return router;
}
