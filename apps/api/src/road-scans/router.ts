import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "db";
import { candidateAssignSchema, candidateDismissSchema, candidateLinkSchema, roadScanRequestSchema, scanReviewSchema } from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { ScanError } from "./ai-client";
import { assignCandidate, cameraScope, candidateDetail, changeCandidate, createScan, getCandidate, processScan, recentScans, scanDetail, scanOptions } from "./service";
import { reviewScanCompletion } from "./review";

const id = (request: Request) => z.string().uuid().parse(request.params.id);
const route = (fn: (request: Request, response: Response) => Promise<void>) => (request: Request, response: Response) => {
  void fn(request, response).catch((error: unknown) => {
    response.status(error instanceof ScanError ? error.status : error instanceof z.ZodError ? 400 : 500).json({ error: error instanceof ScanError ? error.message : error instanceof z.ZodError ? "Check the submitted scan details." : "The scan request could not be completed." });
  });
};
export function createRoadScansRouter() {
  const router = Router();
  router.use(requireAuth, requirePasswordResetComplete, requireRole("PROJECT_HEAD"));
  router.get("/road-scans/options", route(async (req, res) => { res.json(await scanOptions(req.auth!)); }));
  router.get("/road-scans/recent", route(async (req, res) => { res.json({ scans: await recentScans(req.auth!) }); }));
  router.post("/road-scans", route(async (req, res) => { const input = roadScanRequestSchema.parse(req.body); const scan = await createScan(req.auth!, input.wardId); res.status(201).json({ scan: await scanDetail(req.auth!, scan.id) }); }));
  router.get("/road-scans/:id", route(async (req, res) => { res.json({ scan: await scanDetail(req.auth!, id(req)) }); }));
  router.get("/road-scans/:id/candidates", route(async (req, res) => { res.json({ candidates: (await scanDetail(req.auth!, id(req))).candidates }); }));
  router.post("/road-scans/:id/process", route(async (req, res) => { res.json({ scan: await processScan(req.auth!, id(req)) }); }));
  router.get("/pothole-candidates/:id", route(async (req, res) => { res.json({ candidate: await candidateDetail(req.auth!, id(req)) }); }));
  router.post("/pothole-candidates/:id/assign-inspection", route(async (req, res) => { res.status(201).json(await assignCandidate(req.auth!, id(req), candidateAssignSchema.parse(req.body))); }));
  router.post("/pothole-candidates/:id/dismiss", route(async (req, res) => { await changeCandidate(req.auth!, id(req), candidateDismissSchema.parse(req.body).reason); res.json({ status: "DISMISSED" }); }));
  router.post("/pothole-candidates/:id/link", route(async (req, res) => { const input = candidateLinkSchema.parse(req.body); await changeCandidate(req.auth!, id(req), input.reason, input.projectId); res.json({ status: "LINKED" }); }));
  router.post("/pothole-candidates/:id/verification", route(async (req, res) => { const candidate = await getCandidate(req.auth!, id(req)); const scan = await createScan(req.auth!, candidate.camera.wardId, candidate.id); res.status(201).json({ scan: await scanDetail(req.auth!, scan.id) }); }));
  router.get("/projects/:id/scan-candidates", route(async (req, res) => {
    const projectId = id(req);
    const project = await prisma.project.findFirst({ where: { id: projectId, agencyId: req.auth!.agencyId!, ...(req.auth!.wardId ? { wardId: req.auth!.wardId } : {}) } });
    if (!project) throw new ScanError(404, "Work not found.");
    const candidates = await prisma.potholeCandidate.findMany({ where: { camera: cameraScope(req.auth!), OR: [{ projectId }, ...(project.ticketId ? [{ ticketId: project.ticketId }] : [])] } });
    res.json({ candidates: await Promise.all(candidates.map(candidate => candidateDetail(req.auth!, candidate.id))) });
  }));
  router.post("/projects/:id/scan-completion-review", route(async (req, res) => { const input = scanReviewSchema.parse(req.body); await reviewScanCompletion(req.auth!, id(req), input); res.json({ recorded: true }); }));
  return router;
}
