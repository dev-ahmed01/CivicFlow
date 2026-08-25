import { Router, type NextFunction, type Request, type Response } from "express";
import { registerPushTokenSchema } from "@civicos/shared";
import { UserRole, prisma } from "db";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import { paginationMeta, parsePagination } from "../http/pagination";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

function routeId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createNotificationsRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole(UserRole.CITIZEN, UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN));

  router.get("/notifications", asyncRoute(async (request, response) => {
    const unread = z.enum(["true", "false"]).optional().safeParse(request.query.unread);
    const pagination = parsePagination(request.query);
    if (!unread.success || !pagination.success) {
      response.status(400).json({ error: !unread.success ? "unread must be true or false" : "Invalid pagination" });
      return;
    }
    const where = { userId: request.auth!.userId, ...(unread.data === undefined ? {} : { read: unread.data === "false" ? true : false }) };
    const countOnly = unread.data === "true";
    const [notifications, total, unreadCount] = await Promise.all([
      countOnly ? Promise.resolve([]) : prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: pagination.data.skip, take: pagination.data.limit, select: { id: true, userId: true, type: true, payload: true, read: true, createdAt: true } }),
      countOnly ? Promise.resolve(0) : prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: request.auth!.userId, read: false } }),
    ]);
    response.json({ notifications, unreadCount, pagination: paginationMeta(pagination.data.page, pagination.data.limit, total) });
  }));

  router.patch("/notifications/read", asyncRoute(async (request, response) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Provide between 1 and 50 notification ids" });
      return;
    }
    const result = await prisma.notification.updateMany({ where: { id: { in: parsed.data.ids }, userId: request.auth!.userId, read: false }, data: { read: true } });
    response.json({ updated: result.count });
  }));

  router.patch("/notifications/:id/read", asyncRoute(async (request, response) => {
    const id = z.string().uuid().safeParse(routeId(request));
    if (!id.success) {
      response.status(400).json({ error: "Invalid notification id" });
      return;
    }
    const result = await prisma.notification.updateMany({
      where: { id: id.data, userId: request.auth!.userId },
      data: { read: true },
    });
    if (result.count === 0) {
      response.status(404).json({ error: "Notification not found" });
      return;
    }
    response.json({ read: true });
  }));

  router.post("/notifications/push-tokens", requireRole(UserRole.CITIZEN, UserRole.ENGINEER), asyncRoute(async (request, response) => {
    const parsed = registerPushTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Expo push token", details: parsed.error.flatten() });
      return;
    }
    const token = await prisma.pushToken.upsert({
      where: { token: parsed.data.token },
      update: { userId: request.auth!.userId, platform: parsed.data.platform, active: true },
      create: { userId: request.auth!.userId, ...parsed.data },
      select: { id: true, platform: true },
    });
    response.status(201).json({ token });
  }));

  return router;
}
