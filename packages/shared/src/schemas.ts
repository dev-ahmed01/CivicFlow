import { z } from "zod";

export const userRoleSchema = z.enum([
  "CITIZEN",
  "PROJECT_HEAD",
  "ENGINEER",
]);

// Part III §§10–12 — database enums include every state named by the phase specs.
export const ticketStateSchema = z.enum([
  "DRAFT",
  "AI_CHECK_PENDING",
  "AI_FLAGGED",
  "PENDING_VALIDATION",
  "VALIDATED",
  "ROUTED_TO_AGENCY",
  "INSPECTION_DUE",
  "INSPECTION_COMPLETE",
  "PROJECT_CREATED",
  "ENGINEER_ASSIGNED",
  "WORK_IN_PROGRESS",
  "WORK_COMPLETED",
  "AWAITING_CITIZEN_VERIFICATION",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
]);
export const ticketChannelSchema = z.enum(["WEB", "MOBILE"]);

export const citizenTicketStateSchema = z.enum([
  "REPORT_RECEIVED",
  "COMMUNITY_REVIEW",
  "VERIFIED",
  "ASSIGNED",
  "INSPECTION_AND_PLANNING",
  "WORK_IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "CLOSED",
]);

export const citizenTicketStateLabels = {
  REPORT_RECEIVED: "Report received",
  COMMUNITY_REVIEW: "Community review",
  VERIFIED: "Verified",
  ASSIGNED: "Assigned to agency",
  INSPECTION_AND_PLANNING: "Inspection and planning",
  WORK_IN_PROGRESS: "Work in progress",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  CLOSED: "Closed",
} as const;

// Part III §10.3 — internal workflow names never cross the citizen UI boundary.
export function toCitizenTicketState(state: TicketState): CitizenTicketState {
  if (["DRAFT", "AI_CHECK_PENDING", "AI_FLAGGED"].includes(state)) return "REPORT_RECEIVED";
  if (state === "PENDING_VALIDATION") return "COMMUNITY_REVIEW";
  if (state === "VALIDATED") return "VERIFIED";
  if (state === "ROUTED_TO_AGENCY") return "ASSIGNED";
  if (["INSPECTION_DUE", "INSPECTION_COMPLETE", "PROJECT_CREATED", "ENGINEER_ASSIGNED"].includes(state)) {
    return "INSPECTION_AND_PLANNING";
  }
  if (["WORK_IN_PROGRESS", "WORK_COMPLETED"].includes(state)) return "WORK_IN_PROGRESS";
  if (state === "AWAITING_CITIZEN_VERIFICATION") return "AWAITING_CONFIRMATION";
  return "CLOSED";
}

export const projectStateSchema = z.enum([
  "CREATED",
  "PENDING_UPTAKE",
  "UPTAKEN",
  "TIMELINE_SET",
  "CONFLICT_CHECKED",
  "READY_TO_START",
  "ACTIVE",
  "MODIFIED",
  "COMPLETED",
  "AWAITING_VERIFICATION",
  "CLOSED",
  "CANCELLED",
]);

export const civicWorkOriginSchema = z.enum([
  "AGENCY_PLANNED",
  "CITIZEN_REPORTED",
  "SYSTEM_INTEGRATION",
]);

export const civicWorkPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const completionVerificationDecisionSchema = z.enum(["VERIFIED", "REWORK_REQUESTED"]);
export const inspectionStatusSchema = z.enum(["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED", "REVIEWED"]);
export const inspectionIssueConfirmationSchema = z.enum(["CONFIRMED", "PARTIALLY_CONFIRMED", "NOT_OBSERVED"]);
export const inspectionSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const inspectionComplexitySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const inspectionRecommendationSchema = z.enum(["PROCEED", "COORDINATION_REQUIRED", "ADDITIONAL_INVESTIGATION", "NO_WORK_REQUIRED"]);
export const inspectionReviewDecisionSchema = z.enum(["CREATE_WORK", "ADDITIONAL_INSPECTION", "NO_WORK_REQUIRED"]);

export const dependencyStateSchema = z.enum([
  "REQUESTED",
  "PENDING_RESPONSE",
  "ASSIGNED",
  "DECLINED_UNAVAILABLE",
  "DECLINED_NOT_CONCERNED",
  "ESCALATED",
  "FULFILLED",
]);

export const coordinationStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "ACKNOWLEDGED",
  "CLARIFICATION_REQUESTED",
  "INSPECTION_REQUIRED",
  "ENGINEER_ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "REJECTED",
]);

export const validationVoteSchema = z.enum(["CONFIRM", "NOT_SURE", "REJECT"]);
export const interventionPurposeSchema = z.enum(["pipeline", "cable", "OFC", "resurfacing", "other"]);
export const roadConflictTypeSchema = z.enum([
  "SPATIAL",
  "TEMPORAL",
  "SEQUENCING_VIOLATION",
  "RESTORATION_TOO_EARLY",
  "REPEATED_EXCAVATION_RISK",
  "DUPLICATE_INTERVENTION",
]);
export const roadConflictSeveritySchema = z.enum(["HIGH", "MEDIUM_HIGH", "MEDIUM"]);
export const sequencingRecommendationOutcomeSchema = z.enum(["ACCEPTED", "MODIFIED", "DISMISSED"]);

const idSchema = z.string().uuid();
const dateSchema = z.coerce.date();

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const updateCitizenLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const boundedLongitudeSchema = z.number().min(-180).max(180);
const boundedLatitudeSchema = z.number().min(-90).max(90);
const boundedCoordinateSchema = z.tuple([boundedLongitudeSchema, boundedLatitudeSchema]);

export const civicWorkGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: boundedCoordinateSchema }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(boundedCoordinateSchema).min(2).max(10_000) }),
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(boundedCoordinateSchema).min(4).max(10_000)).min(1).max(100),
  }),
]).superRefine((value, context) => {
  if (value.type === "Polygon") {
    value.coordinates.forEach((ring, index) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["coordinates", index], message: "Polygon rings must be closed" });
      }
    });
  }
});

export const userSchema = z.object({
  id: idSchema,
  role: userRoleSchema,
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  passwordHash: z.string().nullable(),
  mustResetPassword: z.boolean(),
  phoneVerifiedAt: dateSchema.nullable(),
  totpSecret: z.string().nullable(),
  totpEnabled: z.boolean(),
  agencyId: idSchema.nullable(),
  wardId: idSchema.nullable(),
  lastKnownCoordinates: pointSchema.nullable(),
  createdAt: dateSchema,
});

export const wardSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  boundary: polygonSchema,
  verificationRadiusOverrideMeters: z.number().int().positive().nullable(),
});

export const agencySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  type: z.string().min(1),
});

export const categorySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  primaryAgencyId: idSchema,
  isConfigurable: z.boolean(),
});

export const categorySummarySchema = categorySchema.pick({ id: true, name: true }).extend({
  primaryAgency: agencySchema.pick({ id: true, name: true }).optional(),
});

export const reportingAreaSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const citizenTicketSummarySchema = z.object({
  id: idSchema,
  referenceNumber: z.string().regex(/^\d{9,}$/),
  title: z.string(),
  address: z.string(),
  category: categorySummarySchema,
  observationCount: z.number().int().positive(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  status: citizenTicketStateSchema,
  statusLabel: z.string(),
});

export const citizenTicketDetailSchema = citizenTicketSummarySchema.extend({
  originalEvidence: z.array(z.object({
    id: idSchema,
    url: z.string().url(),
    isPrimary: z.boolean(),
  })),
  assignedAgency: agencySchema.pick({ id: true, name: true }).nullable(),
  project: z.object({
    id: idSchema,
    stateLabel: z.string(),
    engineerAssigned: z.boolean(),
    plannedEnd: dateSchema.nullable(),
    workDescription: z.string().nullable(),
    dependencies: z.array(z.object({
      id: idSchema,
      agencyName: z.string(),
      statusLabel: z.string(),
    })),
    completionEvidence: z.array(z.object({
      id: idSchema,
      photoUrl: z.string().url(),
      notes: z.string(),
      submittedAt: dateSchema,
    })),
  }).nullable(),
  responseDeadline: dateSchema.nullable(),
});

export const routingRuleSchema = z.object({
  categoryId: idSchema,
  dependencyAgencyId: idSchema,
});

export const ticketSchema = z.object({
  id: idSchema,
  referenceNumber: z.string().regex(/^\d{9,}$/),
  categoryId: idSchema,
  reporterId: idSchema.nullable(),
  assignedAgencyId: idSchema.nullable(),
  coordinates: pointSchema,
  wardId: idSchema,
  state: ticketStateSchema,
  channel: ticketChannelSchema,
  title: z.string().min(1).max(160),
  address: z.string().min(1),
  aiRetryCount: z.number().int().nonnegative(),
  manualReviewRecommended: z.boolean(),
  duplicateReviewRecommended: z.boolean(),
  duplicateCandidateId: idSchema.nullable(),
  duplicateVisualSimilarity: z.number().min(-1).max(1).nullable(),
  duplicateVisualMatch: z.boolean().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const observationSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  submitterId: idSchema,
  imageUrl: z.string().url(),
  note: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  createdAt: dateSchema,
});

export const createTicketSchema = z.object({
  categoryId: idSchema,
  channel: ticketChannelSchema.optional(),
  title: z.string().trim().min(3).max(160),
  address: z.string().trim().min(3).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  note: z.string().trim().max(1000).optional(),
  primaryImage: z.union([
    z.object({
      fileName: z.string().trim().min(1).max(200),
      contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    }),
    z.object({ validationToken: z.string().min(1) }),
  ]),
});

export const imageUploadRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("presign"),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    isPrimary: z.boolean().default(false),
  }),
  z.object({ action: z.literal("complete"), imageId: idSchema }),
]);

export const uploadContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

export const interventionInputSchema = z.object({
  segmentId: idSchema,
  purpose: interventionPurposeSchema,
  plannedStart: z.string().datetime(),
  plannedEnd: z.string().datetime(),
  affectedLengthM: z.number().positive().max(100_000),
  startOffsetM: z.number().nonnegative().max(100_000).default(0),
  dependencyRefs: z.array(idSchema).max(50).default([]),
}).refine((value) => new Date(value.plannedEnd) >= new Date(value.plannedStart), {
  message: "End date must be on or after the start date",
  path: ["plannedEnd"],
});

// Part II W-P9 — Phase 8 extends this base with road/intervention fields.
export const agencyOriginatedTicketBaseSchema = z.object({
  categoryId: idSchema,
  description: z.string().trim().min(10).max(2000),
  wardId: idSchema,
  evidence: z.object({
    fileName: z.string().trim().min(1).max(200),
    contentType: uploadContentTypeSchema,
  }),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().trim().min(3).max(500).optional(),
  }).optional(),
});

export const agencyOriginatedTicketRequestSchema = z.discriminatedUnion("action", [
  agencyOriginatedTicketBaseSchema.extend({ action: z.literal("create"), intervention: interventionInputSchema.optional() }),
  z.object({ action: z.literal("complete"), imageId: idSchema }),
]);

export const inspectionReportRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("presign"),
    fileName: z.string().trim().min(1).max(200),
    contentType: uploadContentTypeSchema,
    notes: z.string().trim().min(3).max(3000),
  }),
  z.object({ action: z.literal("complete"), reportId: idSchema }),
]);

export const assignInspectionSchema = z.object({
  engineerId: idSchema,
  deadline: z.string().datetime(),
});

export const inspectionEvidenceRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("presign"), fileName: z.string().trim().min(1).max(200), contentType: uploadContentTypeSchema }),
  z.object({ action: z.literal("complete"), evidenceId: idSchema }),
]);

export const submitInspectionSchema = z.object({
  issueConfirmation: inspectionIssueConfirmationSchema,
  severity: inspectionSeveritySchema,
  observations: z.string().trim().min(10).max(5000),
  recommendedWork: z.string().trim().min(3).max(3000),
  complexity: inspectionComplexitySchema,
  coordinationRequired: z.boolean(),
  otherAgencyInvolvement: z.string().trim().max(2000).optional(),
  recommendation: inspectionRecommendationSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).superRefine((value, context) => {
  if (value.coordinationRequired && !value.otherAgencyInvolvement) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["otherAgencyInvolvement"], message: "Describe the other agency involvement" });
  }
});

export const reviewInspectionSchema = z.object({
  decision: inspectionReviewDecisionSchema,
  note: z.string().trim().min(3).max(3000),
  engineerId: idSchema.optional(),
  deadline: z.string().datetime().optional(),
});

export const requestReassignmentSchema = z.object({
  reason: z.enum(["WORKLOAD", "SKILL_MISMATCH", "AVAILABILITY", "LOCATION", "OTHER"]),
  note: z.string().trim().max(2000).optional(),
  availableFrom: z.string().datetime().optional(),
});

export const respondReassignmentSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE"), engineerId: idSchema, note: z.string().trim().min(3).max(2000) }),
  z.object({ decision: z.literal("DECLINE"), note: z.string().trim().min(3).max(2000) }),
]);

export const reportProjectBlockerSchema = z.object({
  title: z.string().trim().min(3).max(180),
  details: z.string().trim().min(10).max(5000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export const resolveProjectBlockerSchema = z.object({ resolution: z.string().trim().min(3).max(3000) });

export const createProjectSchema = z.object({
  ticketId: idSchema,
  engineerId: idSchema,
  intervention: interventionInputSchema.optional(),
  dependencies: z.array(z.object({
    respondingAgencyId: idSchema,
    requirement: z.string().trim().min(10).max(2000),
    deadline: z.string().datetime().optional(),
  })).max(20).optional(),
});

export const createPlannedCivicWorkSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(5000),
  categoryId: idSchema,
  wardId: idSchema,
  priority: civicWorkPrioritySchema.default("NORMAL"),
  proposedStart: z.string().datetime(),
  proposedEnd: z.string().datetime(),
  locationLabel: z.string().trim().min(3).max(500).optional(),
  geometry: civicWorkGeometrySchema.optional(),
  engineerId: idSchema.optional(),
  intervention: interventionInputSchema.optional(),
  dependencies: z.array(z.object({
    respondingAgencyId: idSchema,
    requirement: z.string().trim().min(10).max(2000),
    deadline: z.string().datetime().optional(),
  })).max(20).optional(),
}).superRefine((value, context) => {
  if (new Date(value.proposedEnd) < new Date(value.proposedStart)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["proposedEnd"], message: "Proposed end must be on or after proposed start" });
  }
  if (!value.geometry && !value.intervention) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["geometry"], message: "Provide a work geometry or a road intervention" });
  }
  if (value.intervention && (value.intervention.plannedStart !== value.proposedStart || value.intervention.plannedEnd !== value.proposedEnd)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["intervention"], message: "Road intervention dates must match the civic work date range" });
  }
});

export const updateCivicWorkSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(10).max(5000).optional(),
  categoryId: idSchema.optional(),
  wardId: idSchema.optional(),
  priority: civicWorkPrioritySchema.optional(),
  proposedStart: z.string().datetime().optional(),
  proposedEnd: z.string().datetime().optional(),
  locationLabel: z.string().trim().min(3).max(500).nullable().optional(),
  geometry: civicWorkGeometrySchema.optional(),
  engineerId: idSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "Choose at least one field to update" });

export const cancelCivicWorkSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export const listCivicWorksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  agencyId: idSchema.optional(),
  wardId: idSchema.optional(),
  categoryId: idSchema.optional(),
  status: projectStateSchema.optional(),
  origin: civicWorkOriginSchema.optional(),
  priority: civicWorkPrioritySchema.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  minLongitude: z.coerce.number().min(-180).max(180).optional(),
  minLatitude: z.coerce.number().min(-90).max(90).optional(),
  maxLongitude: z.coerce.number().min(-180).max(180).optional(),
  maxLatitude: z.coerce.number().min(-90).max(90).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && new Date(value.dateTo) < new Date(value.dateFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "Date range end must be on or after its start" });
  }
  const bounds = [value.minLongitude, value.minLatitude, value.maxLongitude, value.maxLatitude];
  if (bounds.some((coordinate) => coordinate !== undefined) && bounds.some((coordinate) => coordinate === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minLongitude"], message: "All four bounding-box coordinates are required" });
  }
  if (value.minLongitude !== undefined && value.maxLongitude !== undefined && value.maxLongitude <= value.minLongitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxLongitude"], message: "Maximum longitude must exceed minimum longitude" });
  }
  if (value.minLatitude !== undefined && value.maxLatitude !== undefined && value.maxLatitude <= value.minLatitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxLatitude"], message: "Maximum latitude must exceed minimum latitude" });
  }
});

// Citizen transparency uses a deliberately narrow contract. Operational Project
// fields must never be added here by spreading the internal model.
export const nearbyCivicWorksQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(100).max(10_000).default(2_000),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const publicCivicWorkStatusSchema = z.enum(["PLANNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"]);
export const publicCivicWorkCompletionSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
export const publicCivicWorkSchema = z.object({
  id: idSchema,
  referenceNumber: z.string().min(1),
  workType: z.string().min(1),
  agency: z.string().min(1),
  approximateLocation: z.object({
    ward: z.string().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  distanceMeters: z.number().nonnegative(),
  status: publicCivicWorkStatusSchema,
  statusLabel: z.string().min(1),
  publicProgress: z.string().min(1),
  plannedStart: dateSchema.nullable(),
  expectedCompletion: dateSchema.nullable(),
  completedAt: dateSchema.nullable(),
  completionStatus: publicCivicWorkCompletionSchema,
});

export const civicWorkPeriodSchema = z.enum(["PAST", "CURRENT", "FUTURE"]);

const spatialBoundsSchema = z.object({
  minLongitude: z.coerce.number().min(-180).max(180).optional(),
  minLatitude: z.coerce.number().min(-90).max(90).optional(),
  maxLongitude: z.coerce.number().min(-180).max(180).optional(),
  maxLatitude: z.coerce.number().min(-90).max(90).optional(),
});

// Phase 2 — calendar reads must always be bounded in both space and time.
export const civicWorkCalendarQuerySchema = spatialBoundsSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  wardId: idSchema.optional(),
  roadSegmentId: idSchema.optional(),
  agencyId: idSchema.optional(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
}).superRefine((value, context) => {
  const from = new Date(value.dateFrom);
  const to = new Date(value.dateTo);
  if (to < from) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "Date range end must be on or after its start" });
  }
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dateTo"], message: "Calendar date range cannot exceed 366 days" });
  }
  const bounds = [value.minLongitude, value.minLatitude, value.maxLongitude, value.maxLatitude];
  const hasAnyBounds = bounds.some((coordinate) => coordinate !== undefined);
  const hasAllBounds = bounds.every((coordinate) => coordinate !== undefined);
  if (hasAnyBounds && !hasAllBounds) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["minLongitude"], message: "All four bounding-box coordinates are required" });
  }
  if (!value.wardId && !value.roadSegmentId && !hasAllBounds) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["wardId"], message: "Choose a ward, road, or map region" });
  }
  if (value.minLongitude !== undefined && value.maxLongitude !== undefined && value.maxLongitude <= value.minLongitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxLongitude"], message: "Maximum longitude must exceed minimum longitude" });
  }
  if (value.minLatitude !== undefined && value.maxLatitude !== undefined && value.maxLatitude <= value.minLatitude) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxLatitude"], message: "Maximum latitude must exceed minimum latitude" });
  }
});

export const civicWorkLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  wardId: idSchema.optional(),
  roadSegmentId: idSchema.optional(),
}).refine((value) => Boolean(value.roadSegmentId || value.wardId), {
  message: "Choose a road or ward for its work ledger",
  path: ["wardId"],
});

export const updateProjectTimelineSchema = z.object({
  plannedStart: z.string().datetime(),
  plannedEnd: z.string().datetime(),
  workDescription: z.string().trim().min(10).max(4000),
  dependencyFlags: z.array(z.string().trim().min(2).max(200)).max(30).default([]),
}).refine((value) => new Date(value.plannedEnd) >= new Date(value.plannedStart), {
  message: "End date must be on or after the start date",
  path: ["plannedEnd"],
});

export const updateProjectStatusSchema = z.object({
  state: z.literal("COMPLETED").optional(),
  note: z.string().trim().min(3).max(3000).optional(),
}).refine((value) => value.state !== undefined || value.note !== undefined, {
  message: "Choose a status update or add a work note",
});

export const completionEvidenceRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("presign"),
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
    notes: z.string().trim().min(3).max(3000),
  }),
  z.object({ action: z.literal("complete"), evidenceId: idSchema }),
]);

export const submitCompletionVerificationSchema = z.object({
  decision: completionVerificationDecisionSchema,
  note: z.string().trim().max(1000).optional(),
});

export const createDependencyRequestsSchema = z.object({
  dependencies: z.array(z.object({
    respondingAgencyId: idSchema,
    requirement: z.string().trim().min(10).max(2000),
    deadline: z.string().datetime().optional(),
  })).min(1).max(20),
});

export const dependencyDirectionSchema = z.enum(["sent", "received"]);
export const dependencyResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ASSIGN_ENGINEER"), engineerId: idSchema.optional() }),
  z.object({ action: z.literal("DECLINE_UNAVAILABLE") }),
  z.object({ action: z.literal("DECLINE_NOT_CONCERNED") }),
  z.object({ action: z.literal("RESEND") }),
  z.object({ action: z.literal("MARK_ASSIGNED_OUT_OF_BAND") }),
  z.object({ action: z.literal("FULFILL") }),
]);

const coordinationMessageSchema = z.string().trim().min(2).max(5000);

export const createCoordinationDraftSchema = z.object({
  respondingAgencyId: idSchema,
  requestTypeKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  subject: z.string().trim().min(5).max(180),
  details: z.string().trim().min(10).max(10_000),
  initialMessage: coordinationMessageSchema,
  responseDeadline: z.string().datetime(),
  inspectionNeeded: z.boolean().default(false),
  engineerRequired: z.boolean().default(false),
  conflictSource: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("PROJECT"), conflictId: idSchema, conflictingProjectId: idSchema }),
    z.object({ kind: z.literal("ROAD"), conflictId: idSchema, conflictingProjectId: idSchema }),
  ]).optional(),
});

export const coordinationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SEND") }),
  z.object({ action: z.literal("ACKNOWLEDGE"), message: coordinationMessageSchema.optional() }),
  z.object({ action: z.literal("REPLY"), message: coordinationMessageSchema }),
  z.object({ action: z.literal("REQUEST_CLARIFICATION"), message: coordinationMessageSchema }),
  z.object({ action: z.literal("REQUEST_INSPECTION"), message: coordinationMessageSchema }),
  z.object({ action: z.literal("ASSIGN_ENGINEER"), engineerId: idSchema, message: coordinationMessageSchema.optional() }),
  z.object({ action: z.literal("PROPOSE_DATETIME"), proposedAt: z.string().datetime(), message: coordinationMessageSchema.optional() }),
  z.object({ action: z.literal("ACCEPT"), message: coordinationMessageSchema.optional() }),
  z.object({ action: z.literal("REJECT"), reason: coordinationMessageSchema }),
  z.object({ action: z.literal("START_PROGRESS"), message: coordinationMessageSchema.optional() }),
  z.object({ action: z.literal("INSPECTION_COMPLETE"), notes: coordinationMessageSchema }),
  z.object({ action: z.literal("COMPLETE"), notes: coordinationMessageSchema }),
  z.object({ action: z.literal("CLOSE"), message: coordinationMessageSchema.optional() }),
]);

export const coordinationAttachmentRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("presign"),
    entryId: idSchema,
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]),
    sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  }),
  z.object({ action: z.literal("complete"), attachmentId: idSchema }),
]);

export const wardSummarySchema = wardSchema.pick({ id: true, name: true });
export const engineerSummarySchema = z.object({ id: idSchema, email: z.string().email().nullable() });
export const routingAgencySuggestionSchema = agencySchema.pick({ id: true, name: true, type: true });
export const inspectionReportSummarySchema = z.object({
  id: idSchema,
  status: inspectionStatusSchema,
  deadline: dateSchema,
  assignedEngineer: engineerSummarySchema,
  assignedBy: engineerSummarySchema,
  acceptedAt: dateSchema.nullable(),
  startedAt: dateSchema.nullable(),
  submittedAt: dateSchema.nullable(),
  reviewedAt: dateSchema.nullable(),
  issueConfirmation: inspectionIssueConfirmationSchema.nullable(),
  severity: inspectionSeveritySchema.nullable(),
  observations: z.string().nullable(),
  recommendedWork: z.string().nullable(),
  complexity: inspectionComplexitySchema.nullable(),
  coordinationRequired: z.boolean().nullable(),
  otherAgencyInvolvement: z.string().nullable(),
  recommendation: inspectionRecommendationSchema.nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  locationConfirmedAt: dateSchema.nullable(),
  reviewDecision: inspectionReviewDecisionSchema.nullable(),
  reviewNote: z.string().nullable(),
  fileUrl: z.string().url().nullable(),
  contentType: z.string().nullable(),
  notes: z.string().nullable(),
  uploadedAt: dateSchema.nullable(),
  createdAt: dateSchema,
  evidence: z.array(z.object({ id: idSchema, fileUrl: z.string().url(), contentType: z.string(), uploadedAt: dateSchema.nullable(), createdAt: dateSchema })),
});
export const inspectionDetailSchema = inspectionReportSummarySchema.extend({
  ticket: z.object({
    id: idSchema,
    referenceNumber: z.string(),
    title: z.string(),
    address: z.string(),
    state: ticketStateSchema,
    category: categorySummarySchema,
    ward: wardSummarySchema,
    roadSegment: z.object({ id: idSchema, roadName: z.string() }).nullable(),
    observations: z.array(z.object({ id: idSchema, imageUrl: z.string().url(), note: z.string().nullable(), latitude: z.number().nullable(), longitude: z.number().nullable(), address: z.string().nullable() })),
  }),
});
export const workflowActionTypeSchema = z.enum(["INSPECT_TICKET", "ACCEPT_INSPECTION", "COMPLETE_INSPECTION", "REVIEW_INSPECTION", "CREATE_PROJECT", "ASSIGN_ENGINEER", "ACCEPT_PROJECT", "SET_TIMELINE", "START_WORK", "COMPLETE_WORK", "SUBMIT_COMPLETION", "RESPOND_DEPENDENCY", "FULFILL_DEPENDENCY", "REVIEW_GRIEVANCE"]);
export const workflowActionSummarySchema = z.object({
  id: idSchema,
  type: workflowActionTypeSchema,
  deadline: dateSchema,
  responsibleUser: engineerSummarySchema,
});
export const grievanceSourceSchema = z.enum(["AUTO_NON_RESPONSE", "CITIZEN"]);
export const grievanceStatusSchema = z.enum(["OPEN", "UNDER_REVIEW", "ESCALATED", "RESOLVED", "REOPENED"]);
export const grievanceSummarySchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  projectId: idSchema.nullable(),
  dependencyId: idSchema.nullable(),
  actionId: idSchema.nullable(),
  reason: z.string(),
  note: z.string().nullable(),
  source: grievanceSourceSchema,
  status: grievanceStatusSchema,
  createdAt: dateSchema,
  escalatedAt: dateSchema.nullable(),
  resolvedAt: dateSchema.nullable(),
  resolutionNote: z.string().nullable(),
  evidenceUrl: z.string().url().nullable(),
});
export const citizenGrievanceReasonSchema = z.enum(["WORK_INCOMPLETE", "INCORRECT_CLOSURE", "ISSUE_UNRESOLVED", "POOR_EXECUTION_QUALITY", "OTHER"]);
export const createCitizenGrievanceSchema = z.object({
  reason: citizenGrievanceReasonSchema,
  note: z.string().trim().max(2000).optional(),
  evidence: z.object({ fileName: z.string().trim().min(1).max(200), contentType: uploadContentTypeSchema }).optional(),
});
export const updateGrievanceSchema = z.object({
  status: grievanceStatusSchema,
  resolutionNote: z.string().trim().max(3000).optional(),
}).superRefine((value, context) => {
  if (value.status === "RESOLVED" && !value.resolutionNote) context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolutionNote"], message: "A resolution note is required" });
});
export const projectHeadTicketSummarySchema = z.object({
  id: idSchema,
  referenceNumber: z.string().regex(/^\d{9,}$/),
  title: z.string(),
  state: ticketStateSchema,
  createdAt: dateSchema,
  category: categorySummarySchema,
  ward: wardSummarySchema,
  validatedAt: dateSchema.nullable(),
  inspectionDue: z.boolean(),
  assignedAgency: agencySchema.pick({ id: true, name: true }).nullable(),
  action: workflowActionSummarySchema.nullable(),
  grievance: grievanceSummarySchema.pick({ id: true, status: true, reason: true, createdAt: true }).nullable(),
});
export const projectHeadTicketDetailSchema = citizenTicketSummarySchema.extend({
  internalState: ticketStateSchema,
  reporterId: idSchema.nullable(),
  ward: wardSummarySchema,
  description: z.string().nullable(),
  evidence: z.array(z.object({ id: idSchema, url: z.string().url(), uploadedAt: dateSchema.nullable() })),
  inspectionReports: z.array(inspectionReportSummarySchema),
  project: z.object({
    id: idSchema,
    state: projectStateSchema,
    engineerId: idSchema.nullable(),
    plannedStart: dateSchema.nullable(),
    plannedEnd: dateSchema.nullable(),
    intervention: z.object({
      segmentId: idSchema,
      purpose: interventionPurposeSchema,
      plannedStart: dateSchema,
      plannedEnd: dateSchema,
      affectedLengthM: z.number().positive(),
      startOffsetM: z.number().nonnegative(),
      dependencyRefs: z.array(idSchema),
    }).nullable(),
  }).nullable(),
  routingSuggestions: z.array(routingAgencySuggestionSchema),
  action: workflowActionSummarySchema.nullable(),
  grievances: z.array(grievanceSummarySchema),
});
export const projectHeadDashboardCountsSchema = z.object({
  newValidatedTickets: z.number().int().nonnegative(),
  inspectionsDue: z.number().int().nonnegative(),
  dependencyRequestsPending: z.number().int().nonnegative(),
  activeProjects: z.number().int().nonnegative(),
  attentionActions: z.number().int().nonnegative(),
  openGrievances: z.number().int().nonnegative(),
  inspectionsAwaitingAssignment: z.number().int().nonnegative(),
  inspectionsAwaitingReview: z.number().int().nonnegative(),
  worksReadyForAssignment: z.number().int().nonnegative(),
  incomingCoordination: z.number().int().nonnegative(),
  conflictsWithoutCoordination: z.number().int().nonnegative(),
  completionReviews: z.number().int().nonnegative(),
  escalations: z.number().int().nonnegative(),
  startingSoon: z.number().int().nonnegative(),
  overdueWorks: z.number().int().nonnegative(),
  activeEngineers: z.number().int().nonnegative(),
  currentConflicts: z.number().int().nonnegative(),
});
export const projectListItemSchema = z.object({
  id: idSchema,
  referenceNumber: z.string().regex(/^CW\d{9,}$/),
  title: z.string().min(1),
  ticketId: idSchema.nullable(),
  agencyId: idSchema,
  origin: civicWorkOriginSchema,
  description: z.string().nullable(),
  locationLabel: z.string().nullable(),
  state: projectStateSchema,
  priority: civicWorkPrioritySchema,
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
  actualStart: dateSchema.nullable(),
  actualCompletion: dateSchema.nullable(),
  workDescription: z.string().nullable(),
  dependencyFlags: z.array(z.string()),
  engineerId: idSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  agency: agencySchema.pick({ id: true, name: true }),
  engineer: engineerSummarySchema.nullable(),
  ticket: z.object({ id: idSchema, title: z.string(), ward: wardSummarySchema }).nullable(),
  dependencyCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  roadConflictCount: z.number().int().nonnegative(),
  coordinationCount: z.number().int().nonnegative(),
  action: workflowActionSummarySchema.nullable(),
  grievance: grievanceSummarySchema.pick({ id: true, status: true, reason: true, createdAt: true }).nullable(),
});

export const citizenTicketFilterSchema = z.enum(["ongoing", "past"]);

export const validationSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  validatorId: idSchema,
  vote: validationVoteSchema,
  counted: z.boolean(),
  createdAt: dateSchema,
});

export const pendingValidationSchema = z.object({
  ticketId: idSchema,
  title: z.string().min(1),
  category: categorySummarySchema,
  imageUrl: z.string().url(),
  address: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  expiresAt: dateSchema,
  confirmationCount: z.number().int().nonnegative(),
  quorum: z.number().int().positive(),
  reportedAt: dateSchema,
});

export const submitValidationSchema = z.object({
  vote: validationVoteSchema,
});

export const submitValidationResultSchema = z.object({
  validationId: idSchema,
  recorded: z.literal(true),
  counted: z.boolean(),
  alreadyResolved: z.boolean(),
  status: citizenTicketStateSchema,
  statusLabel: z.string(),
  confirmationCount: z.number().int().nonnegative(),
  quorum: z.number().int().positive(),
});

export const projectSchema = z.object({
  id: idSchema,
  referenceNumber: z.string().regex(/^CW\d{9,}$/),
  ticketId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  agencyId: idSchema,
  ownerProjectHeadId: idSchema.nullable(),
  createdById: idSchema.nullable(),
  updatedById: idSchema.nullable(),
  origin: civicWorkOriginSchema,
  title: z.string(),
  description: z.string().nullable(),
  locationLabel: z.string().nullable(),
  wardId: idSchema.nullable(),
  state: projectStateSchema,
  priority: civicWorkPrioritySchema,
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
  actualStart: dateSchema.nullable(),
  actualCompletion: dateSchema.nullable(),
  cancelledAt: dateSchema.nullable(),
  cancellationReason: z.string().nullable(),
  workDescription: z.string().nullable(),
  dependencyFlags: z.array(z.string()),
  engineerId: idSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const civicWorkAuditEventSchema = z.object({
  id: idSchema,
  action: z.string().min(1),
  actorId: idSchema.nullable(),
  metadata: z.record(z.unknown()),
  createdAt: dateSchema,
});

export const civicWorkEvidenceSchema = z.object({
  id: idSchema,
  kind: z.enum(["PLANNING_DOCUMENT", "SITE_PHOTO", "PERMIT", "INSPECTION", "OTHER"]),
  label: z.string(),
  url: z.string().url(),
  contentType: z.string().nullable(),
  uploadedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});

export const civicWorkEvidenceRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("presign"), fileName: z.string().trim().min(1).max(200), label: z.string().trim().min(2).max(180), kind: z.enum(["PLANNING_DOCUMENT", "SITE_PHOTO", "PERMIT", "INSPECTION", "OTHER"]).default("PLANNING_DOCUMENT"), contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]), sizeBytes: z.number().int().positive().max(20 * 1024 * 1024) }),
  z.object({ action: z.literal("complete"), evidenceId: idSchema }),
]);

export const projectConflictSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  conflictingProjectId: idSchema,
  conflictingProjectName: z.string().min(1),
  conflictingAgency: agencySchema.pick({ id: true, name: true }),
  overlapStart: dateSchema,
  overlapEnd: dateSchema,
  locationDescription: z.string().min(1),
  distanceMeters: z.number().nonnegative().nullable(),
  reason: z.string(),
  severity: z.enum(["PROMINENT", "INLINE"]),
  detectedAt: dateSchema,
});

export const projectStateTransitionSchema = z.object({
  id: idSchema,
  fromState: projectStateSchema.nullable(),
  toState: projectStateSchema,
  reason: z.string(),
  createdAt: dateSchema,
});

export const projectWorkNoteSchema = z.object({
  id: idSchema,
  note: z.string(),
  createdAt: dateSchema,
  author: engineerSummarySchema,
});

export const completionEvidenceSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  ticketId: idSchema,
  photoUrl: z.string().url(),
  contentType: z.string(),
  notes: z.string(),
  uploadedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});

export const pendingCompletionVerificationSchema = z.object({
  evidenceId: idSchema,
  projectId: idSchema,
  ticketId: idSchema,
  title: z.string(),
  photoUrl: z.string().url(),
  notes: z.string(),
  submittedAt: dateSchema,
  originalPhotoUrl: z.string().url().nullable(),
  address: z.string(),
  categoryName: z.string(),
  agencyName: z.string(),
  engineerLabel: z.string().nullable(),
});

export const dependencySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  requestingAgencyId: idSchema,
  respondingAgencyId: idSchema,
  assignedEngineerId: idSchema.nullable(),
  state: dependencyStateSchema,
  requirement: z.string().min(1),
  deadline: dateSchema,
  respondedAt: dateSchema.nullable(),
  escalatedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});

export const dependencyListItemSchema = dependencySchema.extend({
  project: z.object({
    id: idSchema,
    ticket: z.object({ id: idSchema, title: z.string() }).nullable(),
  }),
  requestingAgency: agencySchema,
  respondingAgency: agencySchema,
  assignedEngineer: engineerSummarySchema.nullable(),
  contacts: z.array(z.object({ email: z.string().email() })),
  action: workflowActionSummarySchema.nullable(),
  grievance: grievanceSummarySchema.pick({ id: true, status: true, reason: true, createdAt: true }).nullable(),
});

export const coordinationAttachmentSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nullable(),
  url: z.string().url(),
  uploadedAt: dateSchema,
});

export const coordinationEntrySchema = z.object({
  id: idSchema,
  action: z.string(),
  message: z.string().nullable(),
  fromStatus: coordinationStatusSchema.nullable(),
  toStatus: coordinationStatusSchema.nullable(),
  createdAt: dateSchema,
  sender: z.object({ id: idSchema, email: z.string().email().nullable(), role: userRoleSchema }),
  senderAgency: agencySchema,
  attachments: z.array(coordinationAttachmentSchema),
});

export const coordinationRequestSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  dependencyId: idSchema.nullable(),
  conflictLogId: idSchema.nullable(),
  roadConflictLogId: idSchema.nullable(),
  conflictingProjectId: idSchema.nullable(),
  requestTypeKey: z.string(),
  subject: z.string(),
  details: z.string(),
  responseDeadline: dateSchema,
  inspectionNeeded: z.boolean(),
  engineerRequired: z.boolean(),
  proposedAt: dateSchema.nullable(),
  inspectionCompletedAt: dateSchema.nullable(),
  status: coordinationStatusSchema,
  sentAt: dateSchema.nullable(),
  closedAt: dateSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  requestingAgency: agencySchema,
  respondingAgency: agencySchema,
  assignedEngineer: engineerSummarySchema.nullable(),
  project: z.object({
    id: idSchema,
    referenceNumber: z.string(),
    title: z.string(),
    locationLabel: z.string().nullable(),
    ticket: z.object({ id: idSchema, title: z.string(), address: z.string() }).nullable(),
    ward: z.object({ id: idSchema, name: z.string() }).nullable(),
  }),
  conflictingProject: z.object({
    id: idSchema,
    referenceNumber: z.string(),
    title: z.string(),
    locationLabel: z.string().nullable(),
    plannedStart: dateSchema.nullable(),
    plannedEnd: dateSchema.nullable(),
    agency: agencySchema.pick({ id: true, name: true, type: true }),
  }).nullable(),
  entries: z.array(coordinationEntrySchema),
});

const coordinationConflictWorkSchema = z.object({
  id: idSchema,
  referenceNumber: z.string(),
  title: z.string(),
  agency: agencySchema.pick({ id: true, name: true }),
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
});

export const coordinationConflictSchema = z.object({
  id: idSchema,
  kind: z.enum(["PROJECT", "ROAD"]),
  sourceWork: coordinationConflictWorkSchema,
  conflictingWork: coordinationConflictWorkSchema,
  locationDescription: z.string().min(1),
  temporalRelationship: z.string().min(1),
  reason: z.string().min(1),
  severity: z.string().min(1),
  roadConflictType: roadConflictTypeSchema.nullable(),
  advisory: z.literal(true),
  detectedAt: dateSchema,
  coordination: z.object({
    requestId: idSchema,
    dependencyId: idSchema.nullable(),
    status: coordinationStatusSchema,
  }).nullable(),
});

export const engineerProjectDetailSchema = projectListItemSchema.extend({
  editable: z.boolean(),
  ticket: z.object({
    id: idSchema,
    title: z.string(),
    address: z.string(),
    state: ticketStateSchema,
    ward: wardSummarySchema,
    category: categorySummarySchema,
    observations: z.array(z.object({ imageUrl: z.string().url(), note: z.string().nullable() })),
    inspectionReports: z.array(inspectionReportSummarySchema),
  }).nullable(),
  dependencies: z.array(dependencySchema.extend({
    respondingAgency: agencySchema.pick({ id: true, name: true }),
  })),
  stateTransitions: z.array(projectStateTransitionSchema),
  workNotes: z.array(projectWorkNoteSchema),
  completionEvidence: z.array(completionEvidenceSchema),
});

export const roadSegmentSchema = z.object({
  id: idSchema,
  roadName: z.string().min(1),
  geometry: lineStringSchema,
  wardId: idSchema,
  surfaceType: z.string().min(1),
  lastRestorationDate: dateSchema.nullable(),
});

export const interventionSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  segmentId: idSchema,
  requestingAgencyId: idSchema,
  purpose: interventionPurposeSchema,
  plannedStart: dateSchema,
  plannedEnd: dateSchema,
  affectedLengthM: z.number().positive(),
  startOffsetM: z.number().nonnegative(),
  dependencyRefs: z.array(idSchema),
  createdAt: dateSchema,
});

export const roadSegmentSummarySchema = roadSegmentSchema.omit({ geometry: true }).extend({
  ward: wardSummarySchema,
});

export const civicWorkSchema = projectSchema.extend({
  geometry: civicWorkGeometrySchema.nullable(),
  category: categorySummarySchema.nullable(),
  agency: agencySchema.pick({ id: true, name: true, type: true }),
  ward: wardSummarySchema.nullable(),
  ownerProjectHead: engineerSummarySchema.nullable(),
  engineer: engineerSummarySchema.nullable(),
  citizenTicketReference: z.object({ id: idSchema, referenceNumber: z.string(), title: z.string() }).nullable(),
  roadSegment: roadSegmentSummarySchema.nullable(),
  dependencyCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  roadConflictCount: z.number().int().nonnegative(),
  evidence: z.array(civicWorkEvidenceSchema),
  audit: z.array(civicWorkAuditEventSchema),
});

export const civicWorkCalendarItemSchema = projectSchema.pick({
  id: true,
  referenceNumber: true,
  title: true,
  description: true,
  locationLabel: true,
  origin: true,
  priority: true,
  state: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualCompletion: true,
  cancelledAt: true,
}).extend({
  geometry: civicWorkGeometrySchema,
  period: civicWorkPeriodSchema,
  category: categorySummarySchema.pick({ id: true, name: true }).nullable(),
  agency: agencySchema.pick({ id: true, name: true, type: true }),
  ward: wardSummarySchema.nullable(),
  engineer: engineerSummarySchema.nullable(),
  roadSegment: roadSegmentSummarySchema.nullable(),
  evidenceCount: z.number().int().nonnegative(),
  dependencySummary: z.object({
    total: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    fulfilled: z.number().int().nonnegative(),
    blocked: z.boolean(),
    blockedBy: z.array(agencySchema.pick({ id: true, name: true })),
  }),
  originalPlannedStart: dateSchema.nullable(),
  originalPlannedEnd: dateSchema.nullable(),
  conflictCount: z.number().int().nonnegative(),
  roadConflictCount: z.number().int().nonnegative(),
});

export const civicWorkLedgerEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["STATUS", "EVIDENCE", "DEPENDENCY", "COORDINATION", "AUDIT"]),
  title: z.string().min(1),
  detail: z.string().nullable(),
  at: dateSchema,
  agency: agencySchema.pick({ id: true, name: true }).nullable(),
  state: z.string().nullable(),
});

export const civicWorkLedgerItemSchema = civicWorkCalendarItemSchema.extend({
  events: z.array(civicWorkLedgerEventSchema),
});

export const civicWorkLedgerLocationSchema = z.object({
  kind: z.enum(["ROAD", "WARD"]),
  id: idSchema,
  name: z.string().min(1),
  ward: wardSummarySchema,
  surfaceType: z.string().nullable(),
  lastRestorationDate: dateSchema.nullable(),
});

export const roadInterventionHistoryItemSchema = interventionSchema.extend({
  requestingAgency: agencySchema.pick({ id: true, name: true }),
  project: z.object({
    id: idSchema,
    state: projectStateSchema,
    ticket: z.object({ id: idSchema, title: z.string() }).nullable(),
  }),
});

export const roadConflictSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  conflictingProjectId: idSchema.nullable(),
  segmentId: idSchema,
  segmentName: z.string().min(1),
  type: roadConflictTypeSchema,
  severity: roadConflictSeveritySchema,
  reason: z.string().min(1),
  conflictingAgency: agencySchema.pick({ id: true, name: true }).nullable(),
  detectedAt: dateSchema,
});

export const sequencingOrderItemSchema = z.object({
  projectId: idSchema.nullable(),
  interventionId: idSchema.nullable(),
  agencyName: z.string().min(1),
  purpose: z.string().min(1),
  plannedStart: dateSchema,
  plannedEnd: dateSchema,
  synthetic: z.boolean().default(false),
});

export const sequencingRecommendationSchema = z.object({
  id: idSchema,
  segmentId: idSchema,
  projectIds: z.array(idSchema),
  proposedOrder: z.array(sequencingOrderItemSchema),
  explanation: z.string().min(1),
  ruleTrace: z.array(z.object({ rule: z.number().int().min(1).max(6), reason: z.string().min(1), projectIds: z.array(idSchema) })),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  latestOutcome: sequencingRecommendationOutcomeSchema.nullable(),
});

export const sequencingRecommendationActionSchema = z.object({
  outcome: sequencingRecommendationOutcomeSchema,
  proposedOrder: z.array(sequencingOrderItemSchema).optional(),
  timelineRevision: z.object({
    projectId: idSchema,
    plannedStart: z.string().datetime(),
    plannedEnd: z.string().datetime(),
  }).refine((value) => new Date(value.plannedEnd) >= new Date(value.plannedStart), {
    message: "End date must be on or after the start date",
    path: ["plannedEnd"],
  }).optional(),
}).superRefine((value, context) => {
  if (value.outcome === "MODIFIED" && !value.proposedOrder && !value.timelineRevision) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "A modified recommendation needs a revised order or timeline" });
  }
  if (value.outcome === "DISMISSED" && value.timelineRevision) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Dismissal cannot revise a project timeline", path: ["timelineRevision"] });
  }
});

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  read: z.boolean(),
  createdAt: dateSchema,
});

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});

export const registerPushTokenSchema = z.object({
  token: z.string().regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/, "Use an Expo push token"),
  platform: z.enum(["ios", "android"]),
});

export const systemConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().min(1),
});

export const requestOtpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 phone format"),
});

export const verifyOtpSchema = requestOtpSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});

export const citizenLoginSchema = z.object({
  userId: z.string().min(3),
  password: z.string().min(8),
});

export const internalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  expectedRole: z.enum(["PROJECT_HEAD", "ENGINEER"]).optional(),
});

export const resetPasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(12),
});

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.string().min(1),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type TicketState = z.infer<typeof ticketStateSchema>;
export type TicketChannel = z.infer<typeof ticketChannelSchema>;
export type CitizenTicketState = z.infer<typeof citizenTicketStateSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
export type CivicWorkOrigin = z.infer<typeof civicWorkOriginSchema>;
export type CivicWorkPriority = z.infer<typeof civicWorkPrioritySchema>;
export type CivicWorkGeometry = z.infer<typeof civicWorkGeometrySchema>;
export type DependencyState = z.infer<typeof dependencyStateSchema>;
export type CoordinationStatus = z.infer<typeof coordinationStatusSchema>;
export type ValidationVote = z.infer<typeof validationVoteSchema>;
export type InterventionPurpose = z.infer<typeof interventionPurposeSchema>;
export type RoadConflictType = z.infer<typeof roadConflictTypeSchema>;
export type RoadConflictSeverity = z.infer<typeof roadConflictSeveritySchema>;
export type SequencingRecommendationOutcome = z.infer<typeof sequencingRecommendationOutcomeSchema>;
export type CompletionVerificationDecision = z.infer<typeof completionVerificationDecisionSchema>;
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;
export type InspectionIssueConfirmation = z.infer<typeof inspectionIssueConfirmationSchema>;
export type InspectionSeverity = z.infer<typeof inspectionSeveritySchema>;
export type InspectionComplexity = z.infer<typeof inspectionComplexitySchema>;
export type InspectionRecommendation = z.infer<typeof inspectionRecommendationSchema>;
export type InspectionReviewDecision = z.infer<typeof inspectionReviewDecisionSchema>;
export type User = z.infer<typeof userSchema>;
export type UpdateCitizenLocation = z.infer<typeof updateCitizenLocationSchema>;
export type Ward = z.infer<typeof wardSchema>;
export type Agency = z.infer<typeof agencySchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategorySummary = z.infer<typeof categorySummarySchema>;
export type ReportingArea = z.infer<typeof reportingAreaSchema>;
export type CitizenTicketSummary = z.infer<typeof citizenTicketSummarySchema>;
export type CitizenTicketDetail = z.infer<typeof citizenTicketDetailSchema>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type PendingValidation = z.infer<typeof pendingValidationSchema>;
export type SubmitValidation = z.infer<typeof submitValidationSchema>;
export type SubmitValidationResult = z.infer<typeof submitValidationResultSchema>;
export type Project = z.infer<typeof projectSchema>;
export type CivicWork = z.infer<typeof civicWorkSchema>;
export type CivicWorkPeriod = z.infer<typeof civicWorkPeriodSchema>;
export type CivicWorkCalendarItem = z.infer<typeof civicWorkCalendarItemSchema>;
export type CivicWorkCalendarQuery = z.infer<typeof civicWorkCalendarQuerySchema>;
export type CivicWorkLedgerEvent = z.infer<typeof civicWorkLedgerEventSchema>;
export type CivicWorkLedgerItem = z.infer<typeof civicWorkLedgerItemSchema>;
export type CivicWorkLedgerLocation = z.infer<typeof civicWorkLedgerLocationSchema>;
export type CivicWorkLedgerQuery = z.infer<typeof civicWorkLedgerQuerySchema>;
export type CreatePlannedCivicWork = z.infer<typeof createPlannedCivicWorkSchema>;
export type UpdateCivicWork = z.infer<typeof updateCivicWorkSchema>;
export type CancelCivicWork = z.infer<typeof cancelCivicWorkSchema>;
export type ListCivicWorksQuery = z.infer<typeof listCivicWorksQuerySchema>;
export type NearbyCivicWorksQuery = z.infer<typeof nearbyCivicWorksQuerySchema>;
export type PublicCivicWorkStatus = z.infer<typeof publicCivicWorkStatusSchema>;
export type PublicCivicWork = z.infer<typeof publicCivicWorkSchema>;
export type ProjectConflict = z.infer<typeof projectConflictSchema>;
export type EngineerProjectDetail = z.infer<typeof engineerProjectDetailSchema>;
export type CompletionEvidence = z.infer<typeof completionEvidenceSchema>;
export type PendingCompletionVerification = z.infer<typeof pendingCompletionVerificationSchema>;
export type Dependency = z.infer<typeof dependencySchema>;
export type DependencyListItem = z.infer<typeof dependencyListItemSchema>;
export type DependencyResponse = z.infer<typeof dependencyResponseSchema>;
export type CreateDependencyRequests = z.infer<typeof createDependencyRequestsSchema>;
export type CreateCoordinationDraft = z.infer<typeof createCoordinationDraftSchema>;
export type CoordinationAction = z.infer<typeof coordinationActionSchema>;
export type CoordinationAttachmentRequest = z.infer<typeof coordinationAttachmentRequestSchema>;
export type CoordinationAttachment = z.infer<typeof coordinationAttachmentSchema>;
export type CoordinationEntry = z.infer<typeof coordinationEntrySchema>;
export type CoordinationRequest = z.infer<typeof coordinationRequestSchema>;
export type CoordinationConflict = z.infer<typeof coordinationConflictSchema>;
export type RoadSegment = z.infer<typeof roadSegmentSchema>;
export type Intervention = z.infer<typeof interventionSchema>;
export type RoadSegmentSummary = z.infer<typeof roadSegmentSummarySchema>;
export type RoadInterventionHistoryItem = z.infer<typeof roadInterventionHistoryItemSchema>;
export type RoadConflict = z.infer<typeof roadConflictSchema>;
export type SequencingOrderItem = z.infer<typeof sequencingOrderItemSchema>;
export type SequencingRecommendation = z.infer<typeof sequencingRecommendationSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type RegisterPushToken = z.infer<typeof registerPushTokenSchema>;
export type SystemConfig = z.infer<typeof systemConfigSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type AgencyOriginatedTicketRequest = z.infer<typeof agencyOriginatedTicketRequestSchema>;
export type InspectionReportRequest = z.infer<typeof inspectionReportRequestSchema>;
export type AssignInspection = z.infer<typeof assignInspectionSchema>;
export type InspectionEvidenceRequest = z.infer<typeof inspectionEvidenceRequestSchema>;
export type SubmitInspection = z.infer<typeof submitInspectionSchema>;
export type ReviewInspection = z.infer<typeof reviewInspectionSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type WardSummary = z.infer<typeof wardSummarySchema>;
export type EngineerSummary = z.infer<typeof engineerSummarySchema>;
export type RoutingAgencySuggestion = z.infer<typeof routingAgencySuggestionSchema>;
export type InspectionReportSummary = z.infer<typeof inspectionReportSummarySchema>;
export type InspectionDetail = z.infer<typeof inspectionDetailSchema>;
export type ProjectHeadTicketSummary = z.infer<typeof projectHeadTicketSummarySchema>;
export type ProjectHeadTicketDetail = z.infer<typeof projectHeadTicketDetailSchema>;
export type ProjectHeadDashboardCounts = z.infer<typeof projectHeadDashboardCountsSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type WorkflowActionSummary = z.infer<typeof workflowActionSummarySchema>;
export type GrievanceSummary = z.infer<typeof grievanceSummarySchema>;
export type GrievanceStatus = z.infer<typeof grievanceStatusSchema>;
export type CitizenGrievanceReason = z.infer<typeof citizenGrievanceReasonSchema>;
export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type CitizenTicketTimelineItem = {
  status: CitizenTicketState;
  label: string;
  at: string | Date;
};
export type CitizenTicketNote = {
  id: string;
  source: "INSPECTION" | "FIELD_UPDATE" | "COMPLETION";
  label: string;
  text: string;
  at: string | Date;
};
export type CitizenLifecycleStage = {
  id: "REPORTED" | "COMMUNITY_VALIDATION" | "VALIDATED" | "ROUTED_TO_AGENCY" | "PROJECT_HEAD_REVIEW" | "ENGINEER_ASSIGNED" | "WORK_IN_PROGRESS" | "COMPLETION_SUBMITTED" | "CITIZEN_VERIFICATION" | "CLOSED";
  label: string;
  state: "complete" | "current" | "upcoming";
  at?: string | Date;
};
export type CitizenTicketTimelineResponse = {
  timeline: CitizenTicketTimelineItem[];
  lifecycle: CitizenLifecycleStage[];
  notes: CitizenTicketNote[];
  grievances: GrievanceSummary[];
  canRaiseGrievance: boolean;
};
