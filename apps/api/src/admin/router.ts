import { Router, type NextFunction, type Request, type Response } from "express";
import { UserRole, prisma } from "db";
import { updateCategoryRoutingSchema, updateRoutingRulesSchema } from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};
function categoryId(request: Request): string {
  const value = request.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole(UserRole.ADMIN), requirePasswordResetComplete);

  router.get("/routing", asyncRoute(async (_request, response) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        primaryAgency: { select: { id: true, name: true } },
        routingRules: { include: { dependencyAgency: { select: { id: true, name: true } } } },
      },
    });
    response.json({ categories });
  }));

  router.patch("/categories/:id/routing", asyncRoute(async (request, response) => {
    const parsed = updateCategoryRoutingSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid primary agency", details: parsed.error.flatten() });
      return;
    }
    const agency = await prisma.agency.findUnique({ where: { id: parsed.data.primaryAgencyId }, select: { id: true } });
    if (!agency) {
      response.status(422).json({ error: "Agency not found" });
      return;
    }
    const id = categoryId(request);
    const result = await prisma.category.updateMany({
      where: { id, adminEditable: true },
      data: { primaryAgencyId: agency.id },
    });
    if (result.count === 0) {
      response.status(404).json({ error: "Editable category not found" });
      return;
    }
    response.json({ categoryId: id, primaryAgencyId: agency.id });
  }));

  router.put("/categories/:id/routing-rules", asyncRoute(async (request, response) => {
    const parsed = updateRoutingRulesSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid dependency agencies", details: parsed.error.flatten() });
      return;
    }
    const id = categoryId(request);
    const dependencyAgencyIds = [...new Set(parsed.data.dependencyAgencyIds)];
    const [category, agencyCount] = await Promise.all([
      prisma.category.findFirst({ where: { id, adminEditable: true }, select: { id: true } }),
      prisma.agency.count({ where: { id: { in: dependencyAgencyIds } } }),
    ]);
    if (!category) {
      response.status(404).json({ error: "Editable category not found" });
      return;
    }
    if (agencyCount !== dependencyAgencyIds.length) {
      response.status(422).json({ error: "One or more dependency agencies do not exist" });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.routingRule.deleteMany({ where: { categoryId: id } });
      if (dependencyAgencyIds.length > 0) {
        await transaction.routingRule.createMany({
          data: dependencyAgencyIds.map((dependencyAgencyId) => ({ categoryId: id, dependencyAgencyId })),
        });
      }
    });
    response.json({ categoryId: id, dependencyAgencyIds });
  }));

  return router;
}
