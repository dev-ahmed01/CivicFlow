import { z } from "zod";

export const userRoleSchema = z.enum([
  "CITIZEN",
  "PROJECT_HEAD",
  "ENGINEER",
  "ADMIN",
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
  "ACTIVE",
  "MODIFIED",
  "COMPLETED",
  "AWAITING_VERIFICATION",
  "CLOSED",
  "CANCELLED",
]);

export const completionVerificationDecisionSchema = z.enum(["VERIFIED", "REWORK_REQUESTED"]);

export const dependencyStateSchema = z.enum([
  "REQUESTED",
  "PENDING_RESPONSE",
  "ASSIGNED",
  "DECLINED_UNAVAILABLE",
  "DECLINED_NOT_CONCERNED",
  "ESCALATED",
  "FULFILLED",
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
  adminEditable: z.boolean(),
});

export const categorySummarySchema = categorySchema.pick({ id: true, name: true });

export const citizenTicketSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  address: z.string(),
  category: categorySummarySchema,
  observationCount: z.number().int().positive(),
  createdAt: dateSchema,
  status: citizenTicketStateSchema,
  statusLabel: z.string(),
});

export const routingRuleSchema = z.object({
  categoryId: idSchema,
  dependencyAgencyId: idSchema,
});

export const ticketSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  reporterId: idSchema.nullable(),
  assignedAgencyId: idSchema.nullable(),
  coordinates: pointSchema,
  wardId: idSchema,
  state: ticketStateSchema,
  title: z.string().min(1).max(160),
  address: z.string().min(1),
  aiRetryCount: z.number().int().nonnegative(),
  manualReviewRecommended: z.boolean(),
  duplicateReviewRecommended: z.boolean(),
  duplicateCandidateId: idSchema.nullable(),
  duplicateVisualSimilarity: z.number().min(-1).max(1).nullable(),
  duplicateVisualMatch: z.boolean().nullable(),
  createdAt: dateSchema,
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
  title: z.string().trim().min(3).max(160),
  address: z.string().trim().min(3).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  note: z.string().trim().max(1000).optional(),
  primaryImage: z.object({
    fileName: z.string().trim().min(1).max(200),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  }),
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

export const createProjectSchema = z.object({
  ticketId: idSchema,
  engineerId: idSchema,
  intervention: interventionInputSchema.optional(),
  dependencies: z.array(z.object({
    respondingAgencyId: idSchema,
    requirement: z.string().trim().min(10).max(2000),
  })).max(20).optional(),
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

export const updateCategoryRoutingSchema = z.object({ primaryAgencyId: idSchema });
export const updateRoutingRulesSchema = z.object({ dependencyAgencyIds: z.array(idSchema).max(50) });

export const adminCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryAgencyId: idSchema,
  adminEditable: z.boolean().default(true),
});
export const adminAgencyInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.string().trim().min(2).max(80),
});
export const adminWardInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  boundary: polygonSchema,
  verificationRadiusOverrideMeters: z.number().int().positive().nullable().default(null),
});
export const adminConfigInputSchema = z.object({
  key: z.string().trim().min(2).max(160).regex(/^[a-z0-9._-]+$/),
  value: z.unknown(),
  description: z.string().trim().min(2).max(500),
});
export const adminUserInputSchema = z.object({
  role: userRoleSchema,
  email: z.string().email().nullable().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
  password: z.string().min(12).optional(),
  agencyId: idSchema.nullable().optional(),
  wardId: idSchema.nullable().optional(),
  mustResetPassword: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.role === "CITIZEN" && !value.phone) context.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Citizens require a phone" });
  if (value.role !== "CITIZEN" && !value.email) context.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Internal users require an email" });
  if (["PROJECT_HEAD", "ENGINEER"].includes(value.role) && !value.agencyId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["agencyId"], message: "Agency role requires an agency" });
});
export const adminRoutingRuleInputSchema = z.object({
  categoryId: idSchema,
  dependencyAgencyId: idSchema,
});

export const wardSummarySchema = wardSchema.pick({ id: true, name: true });
export const engineerSummarySchema = z.object({ id: idSchema, email: z.string().email().nullable() });
export const routingAgencySuggestionSchema = agencySchema.pick({ id: true, name: true, type: true });
export const inspectionReportSummarySchema = z.object({
  id: idSchema,
  fileUrl: z.string().url(),
  contentType: z.string(),
  notes: z.string(),
  uploadedAt: dateSchema.nullable(),
  createdAt: dateSchema,
});
export const projectHeadTicketSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  state: ticketStateSchema,
  createdAt: dateSchema,
  category: categorySummarySchema,
  ward: wardSummarySchema,
  validatedAt: dateSchema.nullable(),
  inspectionDue: z.boolean(),
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
});
export const projectHeadDashboardCountsSchema = z.object({
  newValidatedTickets: z.number().int().nonnegative(),
  inspectionsDue: z.number().int().nonnegative(),
  dependencyRequestsPending: z.number().int().nonnegative(),
  activeProjects: z.number().int().nonnegative(),
});
export const projectListItemSchema = z.object({
  id: idSchema,
  ticketId: idSchema.nullable(),
  agencyId: idSchema,
  state: projectStateSchema,
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
  workDescription: z.string().nullable(),
  dependencyFlags: z.array(z.string()),
  engineerId: idSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  agency: agencySchema.pick({ id: true, name: true }),
  engineer: engineerSummarySchema.nullable(),
  ticket: z.object({ id: idSchema, title: z.string(), ward: wardSummarySchema }).nullable(),
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

// Part III §9 — deliberately excludes aggregate vote/count data to prevent anchoring.
export const pendingValidationSchema = z.object({
  ticketId: idSchema,
  title: z.string().min(1),
  category: categorySummarySchema,
  imageUrl: z.string().url(),
  distanceMeters: z.number().nonnegative(),
  expiresAt: dateSchema,
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
});

export const projectSchema = z.object({
  id: idSchema,
  ticketId: idSchema.nullable(),
  agencyId: idSchema,
  state: projectStateSchema,
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
  workDescription: z.string().nullable(),
  dependencyFlags: z.array(z.string()),
  engineerId: idSchema.nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

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

export const adminConfigSchema = z.object({
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
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  expectedRole: z.enum(["PROJECT_HEAD", "ENGINEER", "ADMIN"]).optional(),
});

export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

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
export type CitizenTicketState = z.infer<typeof citizenTicketStateSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
export type DependencyState = z.infer<typeof dependencyStateSchema>;
export type ValidationVote = z.infer<typeof validationVoteSchema>;
export type InterventionPurpose = z.infer<typeof interventionPurposeSchema>;
export type RoadConflictType = z.infer<typeof roadConflictTypeSchema>;
export type RoadConflictSeverity = z.infer<typeof roadConflictSeveritySchema>;
export type SequencingRecommendationOutcome = z.infer<typeof sequencingRecommendationOutcomeSchema>;
export type CompletionVerificationDecision = z.infer<typeof completionVerificationDecisionSchema>;
export type User = z.infer<typeof userSchema>;
export type UpdateCitizenLocation = z.infer<typeof updateCitizenLocationSchema>;
export type Ward = z.infer<typeof wardSchema>;
export type Agency = z.infer<typeof agencySchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategorySummary = z.infer<typeof categorySummarySchema>;
export type CitizenTicketSummary = z.infer<typeof citizenTicketSummarySchema>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type PendingValidation = z.infer<typeof pendingValidationSchema>;
export type SubmitValidation = z.infer<typeof submitValidationSchema>;
export type SubmitValidationResult = z.infer<typeof submitValidationResultSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectConflict = z.infer<typeof projectConflictSchema>;
export type EngineerProjectDetail = z.infer<typeof engineerProjectDetailSchema>;
export type CompletionEvidence = z.infer<typeof completionEvidenceSchema>;
export type PendingCompletionVerification = z.infer<typeof pendingCompletionVerificationSchema>;
export type Dependency = z.infer<typeof dependencySchema>;
export type DependencyListItem = z.infer<typeof dependencyListItemSchema>;
export type DependencyResponse = z.infer<typeof dependencyResponseSchema>;
export type CreateDependencyRequests = z.infer<typeof createDependencyRequestsSchema>;
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
export type AdminConfig = z.infer<typeof adminConfigSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type AgencyOriginatedTicketRequest = z.infer<typeof agencyOriginatedTicketRequestSchema>;
export type InspectionReportRequest = z.infer<typeof inspectionReportRequestSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type WardSummary = z.infer<typeof wardSummarySchema>;
export type EngineerSummary = z.infer<typeof engineerSummarySchema>;
export type RoutingAgencySuggestion = z.infer<typeof routingAgencySuggestionSchema>;
export type InspectionReportSummary = z.infer<typeof inspectionReportSummarySchema>;
export type ProjectHeadTicketSummary = z.infer<typeof projectHeadTicketSummarySchema>;
export type ProjectHeadTicketDetail = z.infer<typeof projectHeadTicketDetailSchema>;
export type ProjectHeadDashboardCounts = z.infer<typeof projectHeadDashboardCountsSchema>;
export type ProjectListItem = z.infer<typeof projectListItemSchema>;
export type PaginationMeta = { page: number; limit: number; total: number; totalPages: number };
export type CitizenTicketTimelineItem = {
  status: CitizenTicketState;
  label: string;
  at: string | Date;
};
