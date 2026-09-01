import { Router, type NextFunction, type Request, type Response } from "express";
import { UserRole } from "db";
import { analyticsFilterSchema, type AnalyticsReport, type MetricRow } from "@civicos/shared";
import { requireAuth, requirePasswordResetComplete, requireRole } from "../auth/middleware";
import { buildAnalyticsReport, buildPublicDashboard } from "./service";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

function parseFilter(request: Request) {
  const to = typeof request.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.query.to)
    ? `${request.query.to}T23:59:59.999Z`
    : request.query.to || undefined;
  return analyticsFilterSchema.safeParse({
    wardId: request.query.wardId || undefined,
    categoryId: request.query.categoryId || undefined,
    agencyId: request.query.agencyId || undefined,
    from: request.query.from || undefined,
    to,
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function reportCsv(report: AnalyticsReport): string {
  const rows: string[][] = [["section", "dimension", "secondary_dimension", "count", "total", "rate_percent", "average_hours", "accepted", "modified", "dismissed"]];
  const append = (section: string, items: MetricRow[]) => {
    for (const item of items) rows.push([
      section, item.dimension, item.secondaryDimension ?? "", String(item.count ?? ""), String(item.total ?? ""),
      String(item.ratePercent ?? ""), String(item.averageHours ?? ""), String(item.accepted ?? ""), String(item.modified ?? ""), String(item.dismissed ?? ""),
    ]);
  };
  rows.push(["totals", "Tickets created", "", String(report.totals.ticketsCreated), "", "", "", "", "", ""]);
  rows.push(["totals", "Tickets resolved", "", String(report.totals.ticketsResolved), "", String(report.totals.resolutionRatePercent), "", "", "", ""]);
  append("tickets_by_category", report.ticketsByCategory);
  append("tickets_by_ward", report.ticketsByWard);
  append("tickets_by_period", report.ticketsByPeriod);
  append("validation_time_by_ward", report.validationTimeByWard);
  append("inspection_time_by_agency", report.inspectionTimeByAgency);
  append("resolution_time_by_category_agency", report.resolutionTimeByCategoryAgency);
  append("dependency_response_by_agency", report.dependencyResponseByAgency);
  append("dependency_escalation_by_agency", report.dependencyEscalationByAgency);
  append("validator_participation_by_ward", report.validatorParticipationByWard);
  append("conflicts_by_ward_agency_pair", report.conflictsByWardAgencyPair);
  append("rework_by_agency_engineer", report.reworkByAgencyEngineer);
  append("citizen_not_resolved_by_agency", report.citizenNotResolvedByAgency);
  append("road_conflicts_by_ward_type", report.roadConflictsByWardType);
  append("repeated_excavations_avoided_by_segment_agency", report.repeatedExcavationsAvoidedBySegmentAgency);
  append("sequencing_outcomes_by_agency", report.sequencingOutcomesByAgency);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/([\\()])/g, "\\$1");
}

export function simplePdf(report: AnalyticsReport): Buffer {
  const lines = [
    "CivicOS - Filtered Analytics Report",
    `Generated: ${report.generatedAt}`,
    `Tickets created: ${report.totals.ticketsCreated}`,
    `Tickets resolved: ${report.totals.ticketsResolved} (${report.totals.resolutionRatePercent}%)`,
    `Road conflicts: ${report.totals.roadConflicts}`,
    "",
    "Category breakdown (resolved / created):",
    ...report.ticketsByCategory.slice(0, 24).map((row) => `${row.dimension}: ${row.count ?? 0} / ${row.total ?? 0} (${row.ratePercent ?? 0}%)`),
    "",
    "Agency inspection time (average hours):",
    ...report.inspectionTimeByAgency.slice(0, 16).map((row) => `${row.dimension}: ${row.averageHours ?? 0}`),
  ];
  const content = ["BT", "/F1 11 Tf", "48 790 Td", "14 TL", ...lines.map((line, index) => `${index === 0 ? "" : "T* "}(${pdfEscape(line)}) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

export function createAnalyticsRouter(): Router {
  const router = Router();

  // Part III §19.2 — deliberately mounted before authentication and strictly aggregated.
  router.get("/analytics/public-dashboard", asyncRoute(async (_request, response) => {
    response.json(await buildPublicDashboard());
  }));

  router.get("/analytics/project-head", requireAuth, requireRole(UserRole.PROJECT_HEAD), requirePasswordResetComplete, asyncRoute(async (request, response) => {
    if (!request.auth?.agencyId) {
      response.status(403).json({ error: "Project Head account is missing an agency" });
      return;
    }
    const parsed = parseFilter(request);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid analytics filter", details: parsed.error.flatten() });
      return;
    }
    response.json(await buildAnalyticsReport({ ...parsed.data, agencyId: request.auth.agencyId }));
  }));

  return router;
}
