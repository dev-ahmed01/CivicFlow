import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Channel, Prisma, ProjectState, TicketState, UserRole, prisma } from "db";
import {
  citizenTicketFilterSchema,
  citizenTicketStateLabels,
  createTicketSchema,
  imageUploadRequestSchema,
  toCitizenTicketState,
  type CitizenTicketNote,
  type CitizenLifecycleStage,
  type CitizenTicketTimelineItem,
  type TicketState as SharedTicketState,
} from "@civicos/shared";
import { requireAuth, requireRole } from "../auth/middleware";
import { storageReadUrl, type ImageStorage } from "../images/storage";
import { cosineSimilarity, type ImageRelevanceService } from "../images/relevance";
import { enterPendingValidation } from "../validations/service";
import { paginationMeta, parsePagination } from "../http/pagination";
import { routeRelevantWebTicket } from "../routing/service";
import { imageCompletionDecision, webAutoRoutingEnabled, type DeploymentProfile } from "./web-routing-policy";

const terminalStates: TicketState[] = [TicketState.RESOLVED, TicketState.CLOSED, TicketState.REJECTED, TicketState.CANCELLED];
const preValidationStates: TicketState[] = [TicketState.DRAFT, TicketState.AI_CHECK_PENDING, TicketState.AI_FLAGGED];

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type TicketRow = {
  id: string;
  referenceNumber: string;
  title: string;
  address: string;
  state: TicketState;
  categoryId: string;
  categoryName: string;
  assignedAgencyId: string | null;
  createdAt: Date;
  updatedAt: Date;
  latitude: number;
  longitude: number;
  observationCount: bigint;
  manualReviewRecommended: boolean;
};

type NearbyTicket = { id: string; createdAt: Date; distanceMeters: number };

function configNumber(value: Prisma.JsonValue, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AdminConfig ${key} must contain a positive number`);
  }
  return value;
}

async function getConfigNumber(key: string): Promise<number> {
  const config = await prisma.adminConfig.findUnique({ where: { key } });
  if (!config) throw new Error(`Missing required AdminConfig ${key}`);
  return configNumber(config.value, key);
}

async function getConfigBoolean(key: string): Promise<boolean> {
  const config = await prisma.adminConfig.findUnique({ where: { key } });
  return config?.value === true;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function publicStatus(state: TicketState) {
  const status = toCitizenTicketState(state as SharedTicketState);
  return { status, statusLabel: citizenTicketStateLabels[status] };
}

function projectStatusLabel(state: ProjectState): string {
  if (state === ProjectState.PENDING_UPTAKE) return "Engineer assignment awaiting acceptance";
  if (state === ProjectState.UPTAKEN) return "Engineer accepted the work";
  if (state === ProjectState.TIMELINE_SET || state === ProjectState.CONFLICT_CHECKED) return "Work is being scheduled";
  if (state === ProjectState.ACTIVE || state === ProjectState.MODIFIED) return "Work in progress";
  if (state === ProjectState.COMPLETED) return "Completion evidence is being prepared";
  if (state === ProjectState.AWAITING_VERIFICATION) return "Awaiting citizen verification";
  if (state === ProjectState.CLOSED) return "Work verified and closed";
  if (state === ProjectState.CANCELLED) return "Work plan cancelled";
  return "Project Head review";
}

function dependencyStatusLabel(state: string): string {
  if (state === "FULFILLED") return "Completed";
  if (state === "ASSIGNED") return "Support agency assigned";
  if (state === "ESCALATED") return "Needs agency attention";
  if (state.startsWith("DECLINED")) return "Agency coordination required";
  return "Waiting for another agency";
}

const lifecycleStages: Array<{ id: CitizenLifecycleStage["id"]; label: string }> = [
  { id: "REPORTED", label: "Reported" },
  { id: "COMMUNITY_VALIDATION", label: "Community Validation" },
  { id: "VALIDATED", label: "Validated" },
  { id: "ROUTED_TO_AGENCY", label: "Routed to Agency" },
  { id: "PROJECT_HEAD_REVIEW", label: "Project Head Review" },
  { id: "ENGINEER_ASSIGNED", label: "Engineer Assigned" },
  { id: "WORK_IN_PROGRESS", label: "Work in Progress" },
  { id: "COMPLETION_SUBMITTED", label: "Completion Submitted" },
  { id: "CITIZEN_VERIFICATION", label: "Citizen Verification" },
  { id: "CLOSED", label: "Closed" },
];

function lifecycleRank(state: TicketState): number {
  if (state === TicketState.DRAFT || state === TicketState.AI_CHECK_PENDING || state === TicketState.AI_FLAGGED) return 0;
  if (state === TicketState.PENDING_VALIDATION) return 1;
  if (state === TicketState.VALIDATED) return 2;
  if (state === TicketState.ROUTED_TO_AGENCY) return 3;
  if (
    state === TicketState.INSPECTION_DUE ||
    state === TicketState.INSPECTION_COMPLETE ||
    state === TicketState.PROJECT_CREATED
  ) return 4;
  if (state === TicketState.ENGINEER_ASSIGNED) return 5;
  if (state === TicketState.WORK_IN_PROGRESS) return 6;
  if (state === TicketState.WORK_COMPLETED) return 7;
  if (state === TicketState.AWAITING_CITIZEN_VERIFICATION) return 8;
  return 9;
}

function lifecycleTransitionRank(state: TicketState): number {
  return lifecycleRank(state);
}

async function canAccessTicket(request: Request, ticketId: string): Promise<boolean> {
  const auth = request.auth;
  if (!auth) return false;
  if (auth.role === UserRole.ADMIN) return true;
  if (auth.role === UserRole.CITIZEN) {
    const observation = await prisma.observation.findFirst({
      where: { ticketId, submitterId: auth.userId },
      select: { id: true },
    });
    return Boolean(observation);
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { assignedAgencyId: true } });
  return Boolean(auth.agencyId && ticket?.assignedAgencyId === auth.agencyId);
}

function vectorFromJson(value: Prisma.JsonValue | null): number[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number")) return null;
  return value;
}

async function getTicketRow(ticketId: string): Promise<TicketRow | null> {
  const rows = await prisma.$queryRaw<TicketRow[]>`
    SELECT t."id", t."referenceNumber", t."title", t."address", t."state", t."categoryId",
      c."name" AS "categoryName", t."assignedAgencyId", t."createdAt", t."updatedAt",
      ST_Y(t."coordinates") AS "latitude", ST_X(t."coordinates") AS "longitude",
      COUNT(o."id") AS "observationCount", t."manualReviewRecommended"
    FROM "Ticket" t
    JOIN "Category" c ON c."id" = t."categoryId"
    LEFT JOIN "Observation" o ON o."ticketId" = t."id"
    WHERE t."id" = ${ticketId}::uuid
    GROUP BY t."id", c."name"
  `;
  return rows[0] ?? null;
}

function serializeTicket(row: TicketRow) {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    title: row.title,
    address: row.address,
    category: { id: row.categoryId, name: row.categoryName },
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    observationCount: Number(row.observationCount),
    manualReviewRecommended: row.manualReviewRecommended,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...publicStatus(row.state),
  };
}

async function finalizeNewTicket(
  ticketId: string,
  visualEmbedding: number[] | null,
  destination: "COMMUNITY_VALIDATION" | "DIRECT_AGENCY",
  actedById: string,
) {
  const [radiusMeters, openWindowDays, visualThreshold] = await Promise.all([
    getConfigNumber("duplicate.radius_meters"),
    getConfigNumber("duplicate.open_window_days"),
    getConfigNumber("duplicate.visual_similarity_threshold"),
  ]);

  // Part III §8.2 — PostGIS is authoritative for distance; visual similarity never changes this matrix.
  const nearby = await prisma.$queryRaw<NearbyTicket[]>`
    SELECT candidate."id", candidate."createdAt",
      ST_Distance(candidate."coordinates"::geography, current."coordinates"::geography) AS "distanceMeters"
    FROM "Ticket" candidate
    JOIN "Ticket" current ON current."id" = ${ticketId}::uuid
    WHERE candidate."id" <> current."id"
      AND candidate."categoryId" = current."categoryId"
      AND candidate."state" NOT IN ('RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED')
      AND ST_DWithin(candidate."coordinates"::geography, current."coordinates"::geography, ${radiusMeters})
    ORDER BY "distanceMeters" ASC, candidate."createdAt" DESC
  `;

  const cutoff = new Date(Date.now() - openWindowDays * 24 * 60 * 60 * 1000);
  const recentCandidate = nearby.find((ticket) => ticket.createdAt >= cutoff);
  const candidate = recentCandidate ?? nearby[0];
  let visualSimilarity: number | null = null;
  if (candidate && visualEmbedding) {
    const candidateImage = await prisma.image.findFirst({
      where: { observation: { ticketId: candidate.id }, isPrimary: true, uploadedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { embedding: true },
    });
    const candidateEmbedding = vectorFromJson(candidateImage?.embedding ?? null);
    if (candidateEmbedding) visualSimilarity = cosineSimilarity(visualEmbedding, candidateEmbedding);
  }

  if (candidate) {
    if (recentCandidate) {
      const observation = await prisma.observation.findFirstOrThrow({ where: { ticketId } });
      await prisma.$transaction(async (transaction) => {
        await transaction.observation.update({ where: { id: observation.id }, data: { ticketId: candidate.id } });
        await transaction.ticket.delete({ where: { id: ticketId } });
        const existing = await transaction.ticket.update({ where: { id: candidate.id }, data: { updatedAt: new Date() }, select: { state: true } });
        if (preValidationStates.includes(existing.state)) {
          // Part III §§8.2–9 — a valid new observation must recover a stalled shared report.
          await enterPendingValidation(transaction, candidate.id, existing.state, new Date(), actedById);
        }
      });
      return { ticketId: candidate.id, shared: true };
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        duplicateReviewRecommended: true,
        duplicateCandidateId: candidate.id,
        duplicateVisualSimilarity: visualSimilarity,
        duplicateVisualMatch: visualSimilarity === null ? null : visualSimilarity >= visualThreshold,
      },
    });
  }

  const current = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { state: true } });
  await prisma.$transaction(async (transaction) => {
    if (destination === "DIRECT_AGENCY") {
      await routeRelevantWebTicket(transaction, ticketId, actedById);
    } else {
      await enterPendingValidation(transaction, ticketId, current.state, new Date(), actedById);
    }
  });
  return { ticketId, shared: false };
}

export function createTicketsRouter(
  relevance: ImageRelevanceService,
  storage: ImageStorage,
  deploymentProfile: DeploymentProfile = "local",
): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/reporting-areas", requireRole(UserRole.CITIZEN), asyncRoute(async (_request, response) => {
    const areas = await prisma.$queryRaw<Array<{ id: string; name: string; latitude: number; longitude: number }>>`
      SELECT "id", "name",
        ST_Y(ST_PointOnSurface("boundary"))::double precision AS "latitude",
        ST_X(ST_PointOnSurface("boundary"))::double precision AS "longitude"
      FROM "Ward"
      ORDER BY "name" ASC
    `;
    response.json({ areas });
  }));

  router.post("/reporting-areas/resolve", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const latitude = typeof request.body?.latitude === "number" ? request.body.latitude : Number.NaN;
    const longitude = typeof request.body?.longitude === "number" ? request.body.longitude : Number.NaN;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      response.status(400).json({ error: "Invalid location coordinates" });
      return;
    }
    const areas = await prisma.$queryRaw<Array<{ id: string; name: string; latitude: number; longitude: number }>>`
      SELECT "id", "name", ${latitude}::double precision AS "latitude", ${longitude}::double precision AS "longitude"
      FROM "Ward"
      WHERE ST_Covers("boundary", ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
      LIMIT 1
    `;
    if (!areas[0]) {
      response.status(422).json({ error: "Your current location is outside the supported areas. Choose an area from the list." });
      return;
    }
    response.json({ area: areas[0] });
  }));

  router.get("/categories", requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN), asyncRoute(async (_request, response) => {
    const [categories, roadConfig] = await Promise.all([prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, primaryAgency: { select: { id: true, name: true } } },
    }), prisma.adminConfig.findUnique({ where: { key: "road.category_id" }, select: { value: true } })]);
    const roadCategoryId = typeof roadConfig?.value === "string" ? roadConfig.value : null;
    response.json({ categories: categories.map((category) => ({ ...category, roadIntelligenceEnabled: category.id === roadCategoryId })) });
  }));

  router.post("/tickets", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid report", details: parsed.error.flatten() });
      return;
    }
    const input = parsed.data;
    const category = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } });
    if (!category) {
      response.status(422).json({ error: "Please select an available issue category" });
      return;
    }
    const wards = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Ward"
      WHERE ST_Covers("boundary", ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326))
      LIMIT 1
    `;
    const ward = wards[0];
    if (!ward) {
      response.status(422).json({ error: "Choose a supported reporting area or use a current location within one." });
      return;
    }

    const ticketId = randomUUID();
    const observationId = randomUUID();
    const imageId = randomUUID();
    const objectKey = `tickets/${ticketId}/${imageId}-${safeFileName(input.primaryImage.fileName)}`;
    const upload = storage.createUpload(objectKey, input.primaryImage.contentType);
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "coordinates", "wardId", "state", "channel", "title", "address", "createdAt", "updatedAt")
        VALUES (${ticketId}::uuid, ${input.categoryId}::uuid, ${request.auth!.userId}::uuid,
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326), ${ward.id}::uuid,
          'AI_CHECK_PENDING', ${input.channel ?? Channel.MOBILE}::"Channel", ${input.title}, ${input.address}, NOW(), NOW())
      `;
      await transaction.observation.create({
        data: {
          id: observationId,
          ticketId,
          submitterId: request.auth!.userId,
          imageUrl: upload.publicUrl,
          note: input.note,
          latitude: input.latitude,
          longitude: input.longitude,
          address: input.address,
        },
      });
      await transaction.image.create({
        data: { id: imageId, observationId, url: upload.publicUrl, objectKey, contentType: input.primaryImage.contentType, isPrimary: true },
      });
      await transaction.ticketStateTransition.createMany({ data: [
        { ticketId, fromState: null, toState: TicketState.DRAFT, reason: "REPORT_STARTED", actedById: request.auth!.userId },
        { ticketId, fromState: TicketState.DRAFT, toState: TicketState.AI_CHECK_PENDING, reason: "PRIMARY_IMAGE_UPLOAD_CREATED", actedById: request.auth!.userId },
      ] });
    });
    response.status(201).json({ ticketId, imageId, upload, ...publicStatus(TicketState.AI_CHECK_PENDING) });
  }));

  router.post("/tickets/:id/images", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const parsed = imageUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid image request", details: parsed.error.flatten() });
      return;
    }
    const ticketId = routeId(request);
    if (!(await canAccessTicket(request, ticketId))) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (parsed.data.action === "presign") {
      const uploadInput = parsed.data;
      const observation = await prisma.observation.findFirstOrThrow({
        where: { ticketId, submitterId: request.auth!.userId },
        orderBy: { createdAt: "desc" },
      });
      if (!uploadInput.isPrimary) {
        const supportingCount = await prisma.image.count({ where: { observationId: observation.id, isPrimary: false } });
        if (supportingCount >= 3) {
          response.status(409).json({ error: "A report can have up to three supporting photos" });
          return;
        }
      }
      const imageId = randomUUID();
      const objectKey = `tickets/${ticketId}/${imageId}-${safeFileName(uploadInput.fileName)}`;
      const upload = storage.createUpload(objectKey, uploadInput.contentType);
      await prisma.$transaction(async (transaction) => {
        if (uploadInput.isPrimary) {
          await transaction.image.updateMany({ where: { observationId: observation.id, isPrimary: true }, data: { isPrimary: false } });
          const ticket = await transaction.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { state: true } });
          await transaction.ticket.update({ where: { id: ticketId }, data: { state: TicketState.AI_CHECK_PENDING } });
          if (ticket.state !== TicketState.AI_CHECK_PENDING) {
            await transaction.ticketStateTransition.create({
              data: { ticketId, fromState: ticket.state, toState: TicketState.AI_CHECK_PENDING, reason: "RETAKE_UPLOADED", actedById: request.auth!.userId },
            });
          }
        }
        await transaction.image.create({
          data: { id: imageId, observationId: observation.id, url: upload.publicUrl, objectKey, contentType: uploadInput.contentType, isPrimary: uploadInput.isPrimary },
        });
        if (uploadInput.isPrimary) {
          await transaction.observation.update({ where: { id: observation.id }, data: { imageUrl: upload.publicUrl } });
        }
      });
      response.status(201).json({ imageId, upload });
      return;
    }

    const image = await prisma.image.findFirst({
      where: { id: parsed.data.imageId, observation: { ticketId, submitterId: request.auth!.userId } },
      include: { observation: { include: { ticket: true } } },
    });
    if (!image) {
      response.status(404).json({ error: "Image not found" });
      return;
    }
    if (!image.contentType || !(await storage.verifyUpload(image.objectKey, image.contentType))) {
      response.status(422).json({ error: "The uploaded image is missing, empty, too large, or has an unexpected file type. Upload it again." });
      return;
    }
    if (!image.isPrimary) {
      await prisma.image.update({ where: { id: image.id }, data: { uploadedAt: new Date() } });
      response.json({ imageId: image.id, uploaded: true });
      return;
    }

    let check;
    let embedding: number[] | null;
    try {
      const imageUrl = storage.createDownload(image.objectKey);
      check = await relevance.checkImageRelevance(imageUrl, image.observation.ticket.categoryId);
      embedding = await relevance.getImageEmbedding(imageUrl);
    } catch (error) {
      response.status(502).json({ error: "We could not check this photo right now. Please try again.", detail: error instanceof Error ? error.message : undefined });
      return;
    }
    const maxRetries = await getConfigNumber("ai_relevance.max_retries");
    const nextAttempt = image.observation.ticket.aiRetryCount + 1;
    // The channel is client-reported and spoofable. It is acceptable only as a
    // demo workflow hint: authorization and agency ownership remain server-side.
    const directWebFlow = image.observation.ticket.channel === Channel.WEB
      && webAutoRoutingEnabled(
        image.observation.ticket.channel,
        deploymentProfile,
        await getConfigBoolean("demo.web_auto_route_enabled"),
      );
    const completionDecision = imageCompletionDecision({
      relevancePassed: check.pass,
      directWebFlow,
      attempt: nextAttempt,
      maxRetries,
    });
    await prisma.image.update({
      where: { id: image.id },
      data: { aiRelevanceScore: check.score, embedding: embedding ?? Prisma.JsonNull, uploadedAt: new Date() },
    });

    if (completionDecision === "RETAKE") {
      await prisma.$transaction([
        prisma.ticket.update({ where: { id: ticketId }, data: { state: TicketState.AI_FLAGGED, aiRetryCount: nextAttempt } }),
        prisma.ticketStateTransition.create({
          data: { ticketId, fromState: image.observation.ticket.state, toState: TicketState.AI_FLAGGED, reason: "PHOTO_RETAKE_REQUESTED", actedById: request.auth!.userId },
        }),
      ]);
      response.json({
        ticketId,
        needsRetake: true,
        attemptsRemaining: Math.max(0, maxRetries - nextAttempt),
        message: directWebFlow
          ? "This photo is not relevant to the selected issue. Please upload a photo that clearly shows it."
          : "This photo does not clearly show the selected issue. Please take another photo.",
        ...publicStatus(TicketState.AI_FLAGGED),
      });
      return;
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { aiRetryCount: nextAttempt, manualReviewRecommended: !check.pass },
    });
    const final = await finalizeNewTicket(
      ticketId,
      embedding,
      completionDecision,
      request.auth!.userId,
    );
    const row = await getTicketRow(final.ticketId);
    if (!row) throw new Error("Finalized ticket could not be loaded");
    response.json({ ticket: serializeTicket(row), needsRetake: false });
  }));

  router.get("/tickets/:id", requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN), asyncRoute(async (request, response) => {
    const ticketId = routeId(request);
    if (!(await canAccessTicket(request, ticketId))) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }
    const row = await getTicketRow(ticketId);
    if (!row) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }
    const ticket = serializeTicket(row);
    if (request.auth!.role === UserRole.CITIZEN) {
      const detail = await prisma.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: {
          assignedAgency: { select: { id: true, name: true } },
          observations: {
            where: { submitterId: request.auth!.userId },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              images: {
                where: { uploadedAt: { not: null } },
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: { id: true, url: true, objectKey: true, isPrimary: true },
              },
            },
          },
          project: {
            select: {
              id: true,
              state: true,
              engineerId: true,
              plannedEnd: true,
              workDescription: true,
              dependencies: {
                orderBy: { createdAt: "asc" },
                select: { id: true, state: true, respondingAgency: { select: { name: true } } },
              },
              completionEvidence: {
                where: { uploadedAt: { not: null } },
                orderBy: { createdAt: "desc" },
                select: { id: true, photoUrl: true, objectKey: true, notes: true, uploadedAt: true, createdAt: true },
              },
            },
          },
          workflowActions: {
            where: { respondedAt: null },
            orderBy: { deadline: "asc" },
            take: 1,
            select: { deadline: true },
          },
        },
      });
      response.json({ ticket: {
        ...ticket,
        originalEvidence: (detail.observations[0]?.images ?? []).map(({ objectKey, ...image }) => ({
          ...image,
          url: storageReadUrl(storage, objectKey, image.url),
        })),
        assignedAgency: detail.assignedAgency,
        project: detail.project ? {
          id: detail.project.id,
          stateLabel: projectStatusLabel(detail.project.state),
          engineerAssigned: Boolean(detail.project.engineerId),
          plannedEnd: detail.project.plannedEnd,
          workDescription: detail.project.workDescription,
          dependencies: detail.project.dependencies.map((dependency) => ({
            id: dependency.id,
            agencyName: dependency.respondingAgency.name,
            statusLabel: dependencyStatusLabel(dependency.state),
          })),
          completionEvidence: detail.project.completionEvidence.map(({ objectKey, uploadedAt, createdAt, ...evidence }) => ({
            ...evidence,
            photoUrl: storageReadUrl(storage, objectKey, evidence.photoUrl),
            submittedAt: uploadedAt ?? createdAt,
          })),
        } : null,
        responseDeadline: detail.workflowActions[0]?.deadline ?? null,
      } });
      return;
    }
    const internal = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: {
        state: true,
        reporterId: true,
        ward: { select: { id: true, name: true } },
        category: {
          select: {
            routingRules: {
              orderBy: { dependencyAgency: { name: "asc" } },
              select: { dependencyAgency: { select: { id: true, name: true, type: true } } },
            },
          },
        },
        observations: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            note: true,
            images: { where: { uploadedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, url: true, objectKey: true, uploadedAt: true } },
          },
        },
        inspectionReports: {
          where: { uploadedAt: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { id: true, fileUrl: true, objectKey: true, contentType: true, notes: true, uploadedAt: true, createdAt: true },
        },
        project: { select: { id: true, state: true, engineerId: true, plannedStart: true, plannedEnd: true, intervention: true } },
        workflowActions: { where: { respondedAt: null }, orderBy: { deadline: "asc" }, take: 1, include: { responsibleUser: { select: { id: true, email: true } } } },
        grievances: { orderBy: { createdAt: "desc" } },
      },
    });
    // Part III §7 — dependency agencies are advisory pre-suggestions only.
    response.json({
      ticket: {
        ...ticket,
        internalState: internal.state,
        reporterId: internal.reporterId,
        ward: internal.ward,
        description: internal.observations[0]?.note ?? null,
        evidence: (internal.observations[0]?.images ?? []).map(({ objectKey, ...image }) => ({ ...image, url: storageReadUrl(storage, objectKey, image.url) })),
        inspectionReports: internal.inspectionReports.map(({ objectKey, ...report }) => ({ ...report, fileUrl: storageReadUrl(storage, objectKey, report.fileUrl) })),
        project: internal.project ? { ...internal.project, intervention: internal.project.intervention ? {
          ...internal.project.intervention,
          dependencyRefs: Array.isArray(internal.project.intervention.dependencyRefs)
            ? internal.project.intervention.dependencyRefs.filter((item): item is string => typeof item === "string")
            : [],
        } : null } : null,
        routingSuggestions: internal.category.routingRules.map((rule) => rule.dependencyAgency),
        action: internal.workflowActions[0] ?? null,
        grievances: internal.grievances.map(({ evidenceObjectKey, ...grievance }) => ({
          ...grievance,
          evidenceUrl: evidenceObjectKey && grievance.evidenceUrl ? storageReadUrl(storage, evidenceObjectKey, grievance.evidenceUrl) : grievance.evidenceUrl,
        })),
      },
    });
  }));

  router.get("/tickets/:id/timeline", requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN), asyncRoute(async (request, response) => {
    const ticketId = routeId(request);
    if (!(await canAccessTicket(request, ticketId))) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }
    const [transitions, ticketNotes, grievances] = await Promise.all([
      prisma.ticketStateTransition.findMany({
        where: { ticketId },
        orderBy: { createdAt: "asc" },
        select: { toState: true, createdAt: true },
      }),
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          createdAt: true,
          state: true,
          inspectionReports: {
            where: { uploadedAt: { not: null } },
            orderBy: { createdAt: "asc" },
            select: { id: true, notes: true, uploadedAt: true, createdAt: true },
          },
          project: {
            select: {
              workNotes: { orderBy: { createdAt: "asc" }, select: { id: true, note: true, createdAt: true } },
              completionEvidence: {
                where: { uploadedAt: { not: null } },
                orderBy: { createdAt: "asc" },
                select: { id: true, notes: true, uploadedAt: true, createdAt: true },
              },
            },
          },
        },
      }),
      prisma.grievance.findMany({ where: { ticketId }, orderBy: { createdAt: "desc" } }),
    ]);
    const timeline = transitions.reduce<CitizenTicketTimelineItem[]>((events, transition) => {
      const status = toCitizenTicketState(transition.toState as SharedTicketState);
      if (events[events.length - 1]?.status !== status) events.push({ status, label: citizenTicketStateLabels[status], at: transition.createdAt });
      return events;
    }, ticketNotes ? [{ status: "REPORT_RECEIVED", label: "Submitted", at: ticketNotes.createdAt }] : []);
    const notes = [
      ...(ticketNotes?.inspectionReports ?? []).map((report) => ({
        id: report.id,
        source: "INSPECTION" as const,
        label: "Inspection update",
        text: report.notes,
        at: report.uploadedAt ?? report.createdAt,
      })),
      ...(ticketNotes?.project?.workNotes ?? []).map((note) => ({
        id: note.id,
        source: "FIELD_UPDATE" as const,
        label: "Engineer update",
        text: note.note,
        at: note.createdAt,
      })),
      ...(ticketNotes?.project?.completionEvidence ?? []).map((evidence) => ({
        id: evidence.id,
        source: "COMPLETION" as const,
        label: "Completion note",
        text: evidence.notes,
        at: evidence.uploadedAt ?? evidence.createdAt,
      })),
    ].sort((first, second) => first.at.getTime() - second.at.getTime()) satisfies CitizenTicketNote[];
    const currentRank = ticketNotes ? lifecycleRank(ticketNotes.state) : 0;
    const reachedAt = new Map<number, Date>();
    if (ticketNotes) reachedAt.set(0, ticketNotes.createdAt);
    for (const transition of transitions) {
      const rank = lifecycleTransitionRank(transition.toState);
      if (!reachedAt.has(rank)) reachedAt.set(rank, transition.createdAt);
    }
    const lifecycle: CitizenLifecycleStage[] = lifecycleStages.map((stage, index) => ({
      ...stage,
      state: index < currentRank ? "complete" : index === currentRank ? "current" : "upcoming",
      ...(reachedAt.get(index) ? { at: reachedAt.get(index)! } : {}),
    }));
    response.json({
      timeline,
      lifecycle,
      notes,
      grievances: grievances.map(({ evidenceObjectKey, ...grievance }) => ({
        ...grievance,
        evidenceUrl: evidenceObjectKey && grievance.evidenceUrl ? storageReadUrl(storage, evidenceObjectKey, grievance.evidenceUrl) : grievance.evidenceUrl,
      })),
      canRaiseGrievance: ticketNotes ? ([TicketState.WORK_COMPLETED, TicketState.AWAITING_CITIZEN_VERIFICATION, TicketState.RESOLVED, TicketState.CLOSED] as TicketState[]).includes(ticketNotes.state) : false,
    });
  }));

  router.get("/citizens/me/tickets", requireRole(UserRole.CITIZEN), asyncRoute(async (request, response) => {
    const filter = citizenTicketFilterSchema.safeParse(request.query.filter ?? "ongoing");
    const pagination = parsePagination(request.query);
    if (!filter.success || !pagination.success) {
      response.status(400).json({ error: !filter.success ? "filter must be ongoing or past" : "page and limit must be positive integers; limit cannot exceed 50" });
      return;
    }
    const where = {
      observations: { some: { submitterId: request.auth!.userId } },
      state: filter.data === "past" ? { in: terminalStates } : { notIn: terminalStates },
    };
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: { id: true, referenceNumber: true, title: true, address: true, state: true, createdAt: true, updatedAt: true, category: { select: { id: true, name: true } }, _count: { select: { observations: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (pagination.data.page - 1) * pagination.data.limit,
        take: pagination.data.limit,
      }),
      prisma.ticket.count({ where }),
    ]);
    response.json({ tickets: tickets.map((ticket) => ({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      title: ticket.title,
      address: ticket.address,
      category: ticket.category,
      observationCount: ticket._count.observations,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      ...publicStatus(ticket.state),
    })), pagination: paginationMeta(pagination.data.page, pagination.data.limit, total) });
  }));

  return router;
}
