import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, TicketState, UserRole, prisma } from "db";
import {
  citizenTicketFilterSchema,
  citizenTicketStateLabels,
  createTicketSchema,
  imageUploadRequestSchema,
  toCitizenTicketState,
  type TicketState as SharedTicketState,
} from "@civicos/shared";
import { requireAuth, requireRole } from "../auth/middleware";
import type { ImageStorage } from "../images/storage";
import { cosineSimilarity, type ImageRelevanceService } from "../images/relevance";
import { enterPendingValidation } from "../validations/service";
import { paginationMeta, parsePagination } from "../http/pagination";

const terminalStates: TicketState[] = [TicketState.RESOLVED, TicketState.CLOSED, TicketState.REJECTED, TicketState.CANCELLED];

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
  title: string;
  address: string;
  state: TicketState;
  categoryId: string;
  categoryName: string;
  assignedAgencyId: string | null;
  createdAt: Date;
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

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function publicStatus(state: TicketState) {
  const status = toCitizenTicketState(state as SharedTicketState);
  return { status, statusLabel: citizenTicketStateLabels[status] };
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
    SELECT t."id", t."title", t."address", t."state", t."categoryId",
      c."name" AS "categoryName", t."assignedAgencyId", t."createdAt",
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
    title: row.title,
    address: row.address,
    category: { id: row.categoryId, name: row.categoryName },
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    observationCount: Number(row.observationCount),
    manualReviewRecommended: row.manualReviewRecommended,
    createdAt: row.createdAt,
    ...publicStatus(row.state),
  };
}

async function finalizeNewTicket(ticketId: string, visualEmbedding: number[] | null) {
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
    await enterPendingValidation(transaction, ticketId, current.state);
  });
  return { ticketId, shared: false };
}

export function createTicketsRouter(relevance: ImageRelevanceService, storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/categories", requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN), asyncRoute(async (_request, response) => {
    const [categories, roadConfig] = await Promise.all([prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
      response.status(422).json({ error: "This location is outside the currently supported wards" });
      return;
    }

    const ticketId = randomUUID();
    const observationId = randomUUID();
    const imageId = randomUUID();
    const objectKey = `tickets/${ticketId}/${imageId}-${safeFileName(input.primaryImage.fileName)}`;
    const upload = storage.createUpload(objectKey, input.primaryImage.contentType);
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "coordinates", "wardId", "state", "title", "address", "createdAt")
        VALUES (${ticketId}::uuid, ${input.categoryId}::uuid, ${request.auth!.userId}::uuid,
          ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326), ${ward.id}::uuid,
          'AI_CHECK_PENDING', ${input.title}, ${input.address}, NOW())
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
        data: { id: imageId, observationId, url: upload.publicUrl, objectKey, isPrimary: true },
      });
      await transaction.ticketStateTransition.createMany({ data: [
        { ticketId, fromState: null, toState: TicketState.DRAFT, reason: "REPORT_STARTED" },
        { ticketId, fromState: TicketState.DRAFT, toState: TicketState.AI_CHECK_PENDING, reason: "PRIMARY_IMAGE_UPLOAD_CREATED" },
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
              data: { ticketId, fromState: ticket.state, toState: TicketState.AI_CHECK_PENDING, reason: "RETAKE_UPLOADED" },
            });
          }
        }
        await transaction.image.create({
          data: { id: imageId, observationId: observation.id, url: upload.publicUrl, objectKey, isPrimary: uploadInput.isPrimary },
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
    if (!image.isPrimary) {
      await prisma.image.update({ where: { id: image.id }, data: { uploadedAt: new Date() } });
      response.json({ imageId: image.id, uploaded: true });
      return;
    }

    let check;
    let embedding: number[] | null;
    try {
      check = await relevance.checkImageRelevance(image.url, image.observation.ticket.categoryId);
      embedding = await relevance.getImageEmbedding(image.url);
    } catch (error) {
      response.status(502).json({ error: "We could not check this photo right now. Please try again.", detail: error instanceof Error ? error.message : undefined });
      return;
    }
    const maxRetries = await getConfigNumber("ai_relevance.max_retries");
    const nextAttempt = image.observation.ticket.aiRetryCount + 1;
    await prisma.image.update({
      where: { id: image.id },
      data: { aiRelevanceScore: check.score, embedding: embedding ?? Prisma.JsonNull, uploadedAt: new Date() },
    });

    if (!check.pass && nextAttempt < maxRetries) {
      await prisma.$transaction([
        prisma.ticket.update({ where: { id: ticketId }, data: { state: TicketState.AI_FLAGGED, aiRetryCount: nextAttempt } }),
        prisma.ticketStateTransition.create({
          data: { ticketId, fromState: image.observation.ticket.state, toState: TicketState.AI_FLAGGED, reason: "PHOTO_RETAKE_REQUESTED" },
        }),
      ]);
      response.json({ ticketId, needsRetake: true, attemptsRemaining: maxRetries - nextAttempt, message: "This photo does not clearly show the selected issue. Please take another photo.", ...publicStatus(TicketState.AI_FLAGGED) });
      return;
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { aiRetryCount: nextAttempt, manualReviewRecommended: !check.pass },
    });
    const final = await finalizeNewTicket(ticketId, embedding);
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
      response.json({ ticket });
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
            images: { orderBy: { createdAt: "asc" }, select: { id: true, url: true, uploadedAt: true } },
          },
        },
        inspectionReports: {
          orderBy: { createdAt: "desc" },
          select: { id: true, fileUrl: true, contentType: true, notes: true, uploadedAt: true, createdAt: true },
        },
        project: { select: { id: true, state: true, engineerId: true, plannedStart: true, plannedEnd: true, intervention: true } },
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
        evidence: internal.observations[0]?.images ?? [],
        inspectionReports: internal.inspectionReports,
        project: internal.project ? { ...internal.project, intervention: internal.project.intervention ? {
          ...internal.project.intervention,
          dependencyRefs: Array.isArray(internal.project.intervention.dependencyRefs)
            ? internal.project.intervention.dependencyRefs.filter((item): item is string => typeof item === "string")
            : [],
        } : null } : null,
        routingSuggestions: internal.category.routingRules.map((rule) => rule.dependencyAgency),
      },
    });
  }));

  router.get("/tickets/:id/timeline", requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN), asyncRoute(async (request, response) => {
    const ticketId = routeId(request);
    if (!(await canAccessTicket(request, ticketId))) {
      response.status(404).json({ error: "Ticket not found" });
      return;
    }
    const transitions = await prisma.ticketStateTransition.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: { toState: true, createdAt: true },
    });
    const timeline = transitions.reduce<Array<{ status: string; label: string; at: Date }>>((events, transition) => {
      const status = toCitizenTicketState(transition.toState as SharedTicketState);
      if (events.at(-1)?.status !== status) events.push({ status, label: citizenTicketStateLabels[status], at: transition.createdAt });
      return events;
    }, []);
    response.json({ timeline });
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
        select: { id: true, title: true, address: true, state: true, createdAt: true, category: { select: { id: true, name: true } }, _count: { select: { observations: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.data.skip,
        take: pagination.data.limit,
      }),
      prisma.ticket.count({ where }),
    ]);
    response.json({ tickets: tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      address: ticket.address,
      category: ticket.category,
      observationCount: ticket._count.observations,
      createdAt: ticket.createdAt,
      ...publicStatus(ticket.state),
    })), pagination: paginationMeta(pagination.data.page, pagination.data.limit, total) });
  }));

  return router;
}
