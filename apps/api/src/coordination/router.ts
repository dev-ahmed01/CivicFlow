import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { CoordinationStatus, Prisma, UserRole, prisma } from "db";
import {
  coordinationActionSchema,
  coordinationAttachmentRequestSchema,
  coordinationStatusSchema,
  createCoordinationDraftSchema,
  dependencyDirectionSchema,
} from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { storageReadUrl, type ImageStorage } from "../images/storage";
import {
  actOnCoordinationRequest,
  CoordinationActionError,
  coordinationRequestTypes,
  createCoordinationDraft,
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
  const value = request.auth?.agencyId;
  if (!value) throw new CoordinationActionError("This account is missing an agency assignment", 403);
  return value;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

function handleActionError(error: unknown, response: Response): boolean {
  if (!(error instanceof CoordinationActionError)) return false;
  response.status(error.status).json({ error: error.message });
  return true;
}

const coordinationInclude = {
  requestingAgency: { select: { id: true, name: true, type: true } },
  respondingAgency: { select: { id: true, name: true, type: true } },
  assignedEngineer: { select: { id: true, email: true } },
  project: {
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      locationLabel: true,
      ticket: { select: { id: true, title: true, address: true } },
      ward: { select: { id: true, name: true } },
    },
  },
  entries: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      sender: { select: { id: true, email: true, role: true } },
      senderAgency: { select: { id: true, name: true, type: true } },
      attachments: {
        where: { uploadedAt: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, contentType: true, sizeBytes: true, objectKey: true, uploadedAt: true },
      },
    },
  },
} satisfies Prisma.CoordinationRequestInclude;

function serializeRequest(storage: ImageStorage, record: Awaited<ReturnType<typeof loadRequest>>) {
  if (!record) return null;
  return {
    ...record,
    entries: record.entries.map((entry) => ({
      ...entry,
      attachments: entry.attachments.map(({ objectKey, uploadedAt, ...attachment }) => ({
        ...attachment,
        uploadedAt: uploadedAt!,
        url: storageReadUrl(storage, objectKey, ""),
      })),
    })),
  };
}

function loadRequest(id: string) {
  return prisma.coordinationRequest.findUnique({ where: { id }, include: coordinationInclude });
}

async function requestForActor(requestId: string, request: Request) {
  const record = await loadRequest(requestId);
  if (!record) throw new CoordinationActionError("Coordination request not found", 404);
  const scopedAgencyId = agencyId(request);
  const party = scopedAgencyId === record.requestingAgencyId || scopedAgencyId === record.respondingAgencyId;
  const engineerAssigned = request.auth!.role === UserRole.ENGINEER && record.assignedEngineerId === request.auth!.userId;
  if (!party || request.auth!.role === UserRole.ENGINEER && !engineerAssigned) {
    throw new CoordinationActionError("Coordination request not found", 404);
  }
  return record;
}

export function createCoordinationRouter(storage: ImageStorage): Router {
  const router = Router();
  router.use(requireAuth, requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER), requirePasswordResetComplete);

  router.get("/coordination-options", asyncRoute(async (request, response) => {
    const ownAgencyId = agencyId(request);
    const [requestTypes, agencies] = await Promise.all([
      coordinationRequestTypes(),
      prisma.agency.findMany({ where: { id: { not: ownAgencyId } }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
    ]);
    response.json({ requestTypes, agencies });
  }));

  router.post("/projects/:id/coordination-requests", requireRole(UserRole.PROJECT_HEAD), asyncRoute(async (request, response) => {
    const parsed = createCoordinationDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid coordination request", details: parsed.error.flatten() });
      return;
    }
    try {
      response.status(201).json(await createCoordinationDraft(routeId(request), {
        userId: request.auth!.userId,
        role: request.auth!.role,
        agencyId: request.auth!.agencyId,
      }, parsed.data));
    } catch (error) {
      if (!handleActionError(error, response)) throw error;
    }
  }));

  router.get("/coordination-requests", asyncRoute(async (request, response) => {
    const direction = dependencyDirectionSchema.safeParse(request.query.direction);
    const status = request.query.status ? coordinationStatusSchema.safeParse(request.query.status) : null;
    if (!direction.success || status && !status.success) {
      response.status(400).json({ error: "direction must be sent or received and status must be valid" });
      return;
    }
    const scopedAgencyId = agencyId(request);
    const records = await prisma.coordinationRequest.findMany({
      where: {
        ...(direction.data === "sent" ? { requestingAgencyId: scopedAgencyId } : { respondingAgencyId: scopedAgencyId }),
        ...(status?.success ? { status: status.data } : direction.data === "received" ? { status: { not: CoordinationStatus.DRAFT } } : {}),
        ...(request.auth!.role === UserRole.ENGINEER ? { assignedEngineerId: request.auth!.userId } : {}),
      },
      orderBy: [{ responseDeadline: "asc" }, { createdAt: "desc" }],
      include: coordinationInclude,
    });
    response.json({ requests: records.map((record) => serializeRequest(storage, record)) });
  }));

  router.get("/coordination-requests/:id", asyncRoute(async (request, response) => {
    try {
      response.json({ request: serializeRequest(storage, await requestForActor(routeId(request), request)) });
    } catch (error) {
      if (!handleActionError(error, response)) throw error;
    }
  }));

  router.post("/coordination-requests/:id/actions", asyncRoute(async (request, response) => {
    const parsed = coordinationActionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid coordination action", details: parsed.error.flatten() });
      return;
    }
    try {
      await requestForActor(routeId(request), request);
      const result = await actOnCoordinationRequest(routeId(request), {
        userId: request.auth!.userId,
        role: request.auth!.role,
        agencyId: request.auth!.agencyId,
      }, parsed.data);
      response.json(result);
    } catch (error) {
      if (!handleActionError(error, response)) throw error;
    }
  }));

  router.post("/coordination-requests/:id/attachments", asyncRoute(async (request, response) => {
    const parsed = coordinationAttachmentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid coordination attachment", details: parsed.error.flatten() });
      return;
    }
    try {
      const coordination = await requestForActor(routeId(request), request);
      if (parsed.data.action === "presign") {
        const entry = await prisma.coordinationEntry.findFirst({ where: { id: parsed.data.entryId, requestId: coordination.id, senderId: request.auth!.userId }, select: { id: true } });
        if (!entry) throw new CoordinationActionError("Attach files only to your own thread entry", 403);
        const attachmentId = randomUUID();
        const objectKey = `coordination/${coordination.id}/${attachmentId}-${safeFileName(parsed.data.fileName)}`;
        const upload = await storage.createUpload(objectKey, parsed.data.contentType);
        await prisma.coordinationAttachment.create({ data: {
          id: attachmentId,
          requestId: coordination.id,
          entryId: entry.id,
          uploadedById: request.auth!.userId,
          fileName: parsed.data.fileName,
          objectKey,
          contentType: parsed.data.contentType,
          sizeBytes: parsed.data.sizeBytes,
        } });
        response.status(201).json({ attachmentId, upload });
        return;
      }
      const attachment = await prisma.coordinationAttachment.findFirst({
        where: { id: parsed.data.attachmentId, requestId: coordination.id, uploadedById: request.auth!.userId, uploadedAt: null },
        select: { id: true, objectKey: true, contentType: true, fileName: true },
      });
      if (!attachment) throw new CoordinationActionError("Pending attachment not found", 404);
      if (!(await storage.verifyUpload(attachment.objectKey, attachment.contentType))) {
        throw new CoordinationActionError("The file is missing, empty, too large, or does not match its declared type", 422);
      }
      const uploadedAt = new Date();
      await prisma.$transaction([
        prisma.coordinationAttachment.update({ where: { id: attachment.id }, data: { uploadedAt } }),
        prisma.projectAuditEvent.create({ data: {
          projectId: coordination.projectId,
          action: "COORDINATION_ATTACHMENT_ADDED",
          actorId: request.auth!.userId,
          metadata: { coordinationRequestId: coordination.id, attachmentId: attachment.id, fileName: attachment.fileName, contentType: attachment.contentType },
        } }),
      ]);
      response.json({ attachmentId: attachment.id, uploadedAt });
    } catch (error) {
      if (!handleActionError(error, response)) throw error;
    }
  }));

  return router;
}
