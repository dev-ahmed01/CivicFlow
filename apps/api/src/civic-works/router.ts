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
  planningPhotoUploadSchema,
  civicWorkGeometrySchema,
} from "@civicos/shared";
import { z } from "zod";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import type { ImageStorage } from "../images/storage";
import { issueValidatedImageToken, verifyValidatedImageToken } from "../images/validation-token";
import { getEnv } from "../config/env";
import { demoWorkflowEnabled, withDemoDefaults, demoDates, demoEngineerId, demoIntervention } from "../config/demo-workflow";
import { isRoadCategory } from "../road-intelligence/service";
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

  router.post("/civic-works/planning-photo", requireRole(UserRole.PROJECT_HEAD), asyncRoute(async (request, response) => {
    const parsed = planningPhotoUploadSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Choose a JPEG, PNG, WebP or HEIC site photo" }); return; }
    const objectKey = `planning-preflight/${actor(request).userId}/${randomUUID()}-${safeFileName(parsed.data.fileName)}`;
    const upload = await storage.createUpload(objectKey, parsed.data.contentType);
    const planningPhotoToken = issueValidatedImageToken(getEnv().JWT_ACCESS_SECRET, { ...parsed.data, userId: actor(request).userId, categoryId: "planning-photo", objectKey });
    response.status(201).json({ upload, planningPhotoToken });
  }));

  router.post(
    "/civic-works/planned",
    requireRole(UserRole.PROJECT_HEAD),
    asyncRoute(async (request, response) => {
      let input = request.body;
      const geometry = civicWorkGeometrySchema.safeParse(input?.geometry);
      // Part III §7.1: the submitted point/geometry determines ward, never a client assertion.
      if (geometry.success) {
        const wards = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
          SELECT "id", "name" FROM "Ward" WHERE ST_Covers("boundary", ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry.data)}),4326)) ORDER BY "id" LIMIT 1
        `;
        if (!wards[0]) { response.status(422).json({ error: "Choose a location inside a supported reporting area" }); return; }
        input = { ...input, wardId: wards[0].id, locationLabel: input.locationLabel || wards[0].name };
      }
      if (await demoWorkflowEnabled()) {
        const category = await prisma.category.findFirst({ where: { primaryAgencyId: actor(request).agencyId ?? "" }, orderBy: { id: "asc" }, select: { id: true, name: true } });
        const dates = demoDates();
        input = withDemoDefaults(input, { title: "Agency site work", description: "Work scope to be confirmed from the submitted site evidence.", categoryId: category?.id, proposedStart: dates.plannedStart, proposedEnd: dates.plannedEnd, engineerId: await demoEngineerId(actor(request).agencyId ?? "") });
        if (typeof input.categoryId === "string" && typeof input.wardId === "string" && await isRoadCategory(prisma, input.categoryId) && !input.intervention) {
          const intervention = await demoIntervention(prisma, input.wardId);
          if (intervention) input.intervention = { ...intervention, plannedStart: input.proposedStart, plannedEnd: input.proposedEnd };
        }
      }
      const parsed = createPlannedCivicWorkSchema.safeParse(input);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid planned work", details: parsed.error.flatten() });
        return;
      }
      let photo;
      try { photo = verifyValidatedImageToken(getEnv().JWT_ACCESS_SECRET, parsed.data.planningPhotoToken); }
      catch { response.status(422).json({ error: "The planning photo upload expired; select the photo again" }); return; }
      if (photo.userId !== actor(request).userId || photo.categoryId !== "planning-photo" || !photo.objectKey.startsWith(`planning-preflight/${actor(request).userId}/`) || !(await storage.verifyUpload(photo.objectKey, photo.contentType))) {
        response.status(422).json({ error: "A successfully uploaded site photo is required before registering work" }); return;
      }
      if (await prisma.projectEvidence.findUnique({ where: { objectKey: photo.objectKey }, select: { id: true } })) {
        response.status(409).json({ error: "This photo is already attached to registered work. Open that work or select a new photo." }); return;
      }
      const work = await createPlannedCivicWork(actor(request), parsed.data, { objectKey: photo.objectKey, contentType: photo.contentType, url: `${getEnv().S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${photo.objectKey.split("/").map(encodeURIComponent).join("/")}` });
      response.status(201).json({ work });
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
