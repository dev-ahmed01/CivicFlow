import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, UserRole, prisma } from "db";
import {
  adminAgencyInputSchema,
  adminCategoryInputSchema,
  adminConfigInputSchema,
  adminRoutingRuleInputSchema,
  adminUserInputSchema,
  adminWardInputSchema,
  updateCategoryRoutingSchema,
  updateRoutingRulesSchema,
} from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

function param(request: Request, name = "id"): string {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function conflictResponse(error: unknown, response: Response): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2025"].includes(error.code)) {
    response.status(error.code === "P2025" ? 404 : 409).json({ error: error.code === "P2002" ? "A record with that unique value already exists" : "This record is referenced by active civic workflow data" });
    return;
  }
  throw error;
}

const userSelect = {
  id: true, role: true, phone: true, email: true, mustResetPassword: true,
  phoneVerifiedAt: true, totpEnabled: true, agencyId: true, wardId: true, createdAt: true,
} as const;

type WardRow = { id: string; name: string; boundary: string; verificationRadiusOverrideMeters: number | null };

const requiredConfigKeys = new Set([
  "auth.otp_max_attempts",
  "road.simulated_restoration_cost_per_meter",
  "road.simulated_avoided_rework_factor",
  "verification.default_radius_meters",
  "verification.daily_cap",
  "verification.quorum",
  "verification.initial_recipient_count",
  "verification.renotify_after_hours",
  "duplicate.radius_meters",
  "duplicate.open_window_days",
  "duplicate.visual_similarity_threshold",
  "ai_relevance.max_retries",
  "ai_relevance.pass_threshold",
  "demo.web_auto_route_enabled",
  "conflict.radius_meters",
  "road.category_id",
  "road.repeated_excavation_days",
  "coordination.request_types",
]);

const positiveIntegerConfigKeys = new Set([
  "auth.otp_max_attempts", "verification.daily_cap", "verification.quorum",
  "verification.initial_recipient_count", "verification.renotify_after_hours",
  "duplicate.open_window_days", "ai_relevance.max_retries", "road.repeated_excavation_days",
]);
const positiveNumberConfigKeys = new Set([
  "road.simulated_restoration_cost_per_meter", "verification.default_radius_meters",
  "duplicate.radius_meters", "conflict.radius_meters",
]);
const ratioConfigKeys = new Set([
  "road.simulated_avoided_rework_factor", "duplicate.visual_similarity_threshold", "ai_relevance.pass_threshold",
]);

async function configValueError(key: string, value: unknown): Promise<string | null> {
  if (positiveIntegerConfigKeys.has(key) && (typeof value !== "number" || !Number.isInteger(value) || value <= 0)) return `${key} must be a positive integer`;
  if (positiveNumberConfigKeys.has(key) && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) return `${key} must be a positive number`;
  if (ratioConfigKeys.has(key) && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) return `${key} must be between 0 and 1`;
  if (key === "demo.web_auto_route_enabled" && typeof value !== "boolean") return `${key} must be true or false`;
  if (key === "coordination.request_types" && (!Array.isArray(value) || value.length === 0 || value.length > 30 || value.some((item) => typeof item !== "string" || !/^[a-z0-9-]{2,80}$/.test(item)))) return `${key} must be a non-empty list of lowercase request-type keys`;
  if (key === "road.category_id") {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return `${key} must reference a category ID`;
    if (!(await prisma.category.findUnique({ where: { id: value }, select: { id: true } }))) return `${key} references a category that does not exist`;
  }
  return null;
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole(UserRole.ADMIN), requirePasswordResetComplete);

  router.get("/categories", asyncRoute(async (_request, response) => {
    response.json({ categories: await prisma.category.findMany({ orderBy: { name: "asc" }, include: { primaryAgency: { select: { id: true, name: true } } } }) });
  }));
  router.post("/categories", asyncRoute(async (request, response) => {
    const parsed = adminCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid category", details: parsed.error.flatten() }); return; }
    try { response.status(201).json(await prisma.category.create({ data: parsed.data })); } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/categories/:id", asyncRoute(async (request, response) => {
    const parsed = adminCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid category", details: parsed.error.flatten() }); return; }
    try { response.json(await prisma.category.update({ where: { id: param(request) }, data: parsed.data })); } catch (error) { conflictResponse(error, response); }
  }));
  router.delete("/categories/:id", asyncRoute(async (request, response) => {
    try { await prisma.category.delete({ where: { id: param(request), adminEditable: true } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  router.get("/routing", asyncRoute(async (_request, response) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" }, include: { primaryAgency: { select: { id: true, name: true } }, routingRules: { include: { dependencyAgency: { select: { id: true, name: true } } } } } });
    response.json({ categories });
  }));
  router.patch("/categories/:id/routing", asyncRoute(async (request, response) => {
    const parsed = updateCategoryRoutingSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid primary agency", details: parsed.error.flatten() }); return; }
    if (!(await prisma.agency.findUnique({ where: { id: parsed.data.primaryAgencyId }, select: { id: true } }))) { response.status(422).json({ error: "Primary agency does not exist" }); return; }
    const result = await prisma.category.updateMany({ where: { id: param(request), adminEditable: true }, data: parsed.data });
    if (result.count === 0) { response.status(404).json({ error: "Editable category not found" }); return; }
    response.json({ categoryId: param(request), ...parsed.data });
  }));
  router.put("/categories/:id/routing-rules", asyncRoute(async (request, response) => {
    const parsed = updateRoutingRulesSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid dependency agencies", details: parsed.error.flatten() }); return; }
    const categoryId = param(request);
    const dependencyAgencyIds = [...new Set(parsed.data.dependencyAgencyIds)];
    const [category, agencyCount] = await Promise.all([
      prisma.category.findFirst({ where: { id: categoryId, adminEditable: true }, select: { id: true } }),
      prisma.agency.count({ where: { id: { in: dependencyAgencyIds } } }),
    ]);
    if (!category) { response.status(404).json({ error: "Editable category not found" }); return; }
    if (agencyCount !== dependencyAgencyIds.length) { response.status(422).json({ error: "One or more dependency agencies do not exist" }); return; }
    await prisma.$transaction(async (transaction) => {
      await transaction.routingRule.deleteMany({ where: { categoryId } });
      if (dependencyAgencyIds.length) await transaction.routingRule.createMany({ data: dependencyAgencyIds.map((dependencyAgencyId) => ({ categoryId, dependencyAgencyId })) });
    });
    response.json({ categoryId, dependencyAgencyIds });
  }));

  router.get("/routing-rules", asyncRoute(async (_request, response) => {
    response.json({ routingRules: await prisma.routingRule.findMany({ orderBy: [{ category: { name: "asc" } }, { dependencyAgency: { name: "asc" } }], include: { category: { select: { name: true } }, dependencyAgency: { select: { name: true } } } }) });
  }));
  router.post("/routing-rules", asyncRoute(async (request, response) => {
    const parsed = adminRoutingRuleInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid routing rule", details: parsed.error.flatten() }); return; }
    try { response.status(201).json(await prisma.routingRule.create({ data: parsed.data })); } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/routing-rules/:categoryId/:dependencyAgencyId", asyncRoute(async (request, response) => {
    const parsed = adminRoutingRuleInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid routing rule", details: parsed.error.flatten() }); return; }
    try {
      const oldKey = { categoryId: param(request, "categoryId"), dependencyAgencyId: param(request, "dependencyAgencyId") };
      await prisma.$transaction([prisma.routingRule.delete({ where: { categoryId_dependencyAgencyId: oldKey } }), prisma.routingRule.create({ data: parsed.data })]);
      response.json(parsed.data);
    } catch (error) { conflictResponse(error, response); }
  }));
  router.delete("/routing-rules/:categoryId/:dependencyAgencyId", asyncRoute(async (request, response) => {
    try { await prisma.routingRule.delete({ where: { categoryId_dependencyAgencyId: { categoryId: param(request, "categoryId"), dependencyAgencyId: param(request, "dependencyAgencyId") } } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  router.get("/wards", asyncRoute(async (_request, response) => {
    const wards = await prisma.$queryRaw<WardRow[]>`SELECT "id", "name", ST_AsGeoJSON("boundary") AS "boundary", "verificationRadiusOverrideMeters" FROM "Ward" ORDER BY "name" ASC`;
    response.json({ wards: wards.map((ward) => ({ ...ward, boundary: JSON.parse(ward.boundary) })) });
  }));
  router.post("/wards", asyncRoute(async (request, response) => {
    const parsed = adminWardInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid ward", details: parsed.error.flatten() }); return; }
    const id = randomUUID();
    try {
      await prisma.$executeRaw`INSERT INTO "Ward" ("id", "name", "boundary", "verificationRadiusOverrideMeters") VALUES (${id}::uuid, ${parsed.data.name}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(parsed.data.boundary)}), 4326), ${parsed.data.verificationRadiusOverrideMeters})`;
      response.status(201).json({ id, ...parsed.data });
    } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/wards/:id", asyncRoute(async (request, response) => {
    const parsed = adminWardInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid ward", details: parsed.error.flatten() }); return; }
    const updated = await prisma.$executeRaw`UPDATE "Ward" SET "name" = ${parsed.data.name}, "boundary" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(parsed.data.boundary)}), 4326), "verificationRadiusOverrideMeters" = ${parsed.data.verificationRadiusOverrideMeters} WHERE "id" = ${param(request)}::uuid`;
    if (updated === 0) { response.status(404).json({ error: "Ward not found" }); return; }
    response.json({ id: param(request), ...parsed.data });
  }));
  router.delete("/wards/:id", asyncRoute(async (request, response) => {
    try { await prisma.ward.delete({ where: { id: param(request) } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  router.get("/config", asyncRoute(async (_request, response) => { response.json({ config: await prisma.adminConfig.findMany({ orderBy: { key: "asc" } }) }); }));
  router.post("/config", asyncRoute(async (request, response) => {
    const parsed = adminConfigInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid config", details: parsed.error.flatten() }); return; }
    const valueError = await configValueError(parsed.data.key, parsed.data.value);
    if (valueError) { response.status(422).json({ error: valueError }); return; }
    try { response.status(201).json(await prisma.adminConfig.create({ data: { ...parsed.data, value: parsed.data.value as Prisma.InputJsonValue } })); } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/config/:key", asyncRoute(async (request, response) => {
    const parsed = adminConfigInputSchema.safeParse({ ...request.body, key: param(request, "key") });
    if (!parsed.success) { response.status(400).json({ error: "Invalid config", details: parsed.error.flatten() }); return; }
    const valueError = await configValueError(parsed.data.key, parsed.data.value);
    if (valueError) { response.status(422).json({ error: valueError }); return; }
    try { response.json(await prisma.adminConfig.update({ where: { key: param(request, "key") }, data: { value: parsed.data.value as Prisma.InputJsonValue, description: parsed.data.description } })); } catch (error) { conflictResponse(error, response); }
  }));
  router.delete("/config/:key", asyncRoute(async (request, response) => {
    if (requiredConfigKeys.has(param(request, "key"))) { response.status(409).json({ error: "This setting is required by an active workflow and cannot be deleted" }); return; }
    try { await prisma.adminConfig.delete({ where: { key: param(request, "key") } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  router.get("/agencies", asyncRoute(async (_request, response) => { response.json({ agencies: await prisma.agency.findMany({ orderBy: { name: "asc" } }) }); }));
  router.post("/agencies", asyncRoute(async (request, response) => {
    const parsed = adminAgencyInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid agency", details: parsed.error.flatten() }); return; }
    try { response.status(201).json(await prisma.agency.create({ data: parsed.data })); } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/agencies/:id", asyncRoute(async (request, response) => {
    const parsed = adminAgencyInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid agency", details: parsed.error.flatten() }); return; }
    try { response.json(await prisma.agency.update({ where: { id: param(request) }, data: parsed.data })); } catch (error) { conflictResponse(error, response); }
  }));
  router.delete("/agencies/:id", asyncRoute(async (request, response) => {
    try { await prisma.agency.delete({ where: { id: param(request) } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  router.get("/users", asyncRoute(async (_request, response) => { response.json({ users: await prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: userSelect }) }); }));
  router.post("/users", asyncRoute(async (request, response) => {
    const parsed = adminUserInputSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.role !== "CITIZEN" && !parsed.data.password) { response.status(400).json({ error: "Invalid user; internal users require a password of at least 12 characters", details: parsed.success ? undefined : parsed.error.flatten() }); return; }
    const { password, ...input } = parsed.data;
    try { response.status(201).json(await prisma.user.create({ data: { ...input, email: input.email?.toLowerCase(), passwordHash: password ? await bcrypt.hash(password, 12) : null }, select: userSelect })); } catch (error) { conflictResponse(error, response); }
  }));
  router.put("/users/:id", asyncRoute(async (request, response) => {
    const parsed = adminUserInputSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ error: "Invalid user", details: parsed.error.flatten() }); return; }
    const { password, ...input } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { id: param(request) }, select: { passwordHash: true } });
    if (!existing) { response.status(404).json({ error: "User not found" }); return; }
    if (input.role !== UserRole.CITIZEN && !password && !existing.passwordHash) { response.status(400).json({ error: "Internal users require a password of at least 12 characters" }); return; }
    try {
      const updated = await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({ where: { id: param(request) }, data: { ...input, email: input.email?.toLowerCase(), ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) }, select: userSelect });
        await transaction.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
        return user;
      });
      response.json(updated);
    } catch (error) { conflictResponse(error, response); }
  }));
  router.delete("/users/:id", asyncRoute(async (request, response) => {
    if (param(request) === request.auth!.userId) { response.status(409).json({ error: "You cannot delete your own active admin account" }); return; }
    try { await prisma.user.delete({ where: { id: param(request) } }); response.status(204).send(); } catch (error) { conflictResponse(error, response); }
  }));

  return router;
}
