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
  "PENDING_CITIZEN_VERIFICATION",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
]);

export const projectStateSchema = z.enum([
  "CREATED",
  "ENGINEER_ASSIGNED",
  "ACCEPTED",
  "TIMELINE_SET",
  "CONFLICT_CHECKED",
  "WORK_IN_PROGRESS",
  "WORK_COMPLETED",
  "PENDING_CITIZEN_VERIFICATION",
  "CLOSED",
  "CANCELLED",
]);

export const dependencyStateSchema = z.enum([
  "REQUESTED",
  "PENDING_RESPONSE",
  "ASSIGNED",
  "DECLINED_UNAVAILABLE",
  "DECLINED_NOT_CONCERNED",
  "ESCALATED",
  "FULFILLED",
]);

export const validationVoteSchema = z.enum(["CONFIRM", "REJECT"]);

const idSchema = z.string().uuid();
const dateSchema = z.coerce.date();

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
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
  createdAt: dateSchema,
});

export const observationSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  submitterId: idSchema,
  imageUrl: z.string().url(),
  note: z.string().nullable(),
  createdAt: dateSchema,
});

export const validationSchema = z.object({
  id: idSchema,
  ticketId: idSchema,
  validatorId: idSchema,
  vote: validationVoteSchema,
  createdAt: dateSchema,
});

export const projectSchema = z.object({
  id: idSchema,
  ticketId: idSchema.nullable(),
  agencyId: idSchema,
  state: projectStateSchema,
  plannedStart: dateSchema.nullable(),
  plannedEnd: dateSchema.nullable(),
  engineerId: idSchema.nullable(),
  createdAt: dateSchema,
});

export const dependencySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  requestingAgencyId: idSchema,
  respondingAgencyId: idSchema,
  assignedEngineerId: idSchema.nullable(),
  state: dependencyStateSchema,
  createdAt: dateSchema,
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
  purpose: z.string().min(1),
  plannedStart: dateSchema,
  plannedEnd: dateSchema,
  affectedLengthM: z.number().positive(),
  dependencyRefs: z.array(idSchema),
});

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  read: z.boolean(),
  createdAt: dateSchema,
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

export const internalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
export type ProjectState = z.infer<typeof projectStateSchema>;
export type DependencyState = z.infer<typeof dependencyStateSchema>;
export type ValidationVote = z.infer<typeof validationVoteSchema>;
export type User = z.infer<typeof userSchema>;
export type Ward = z.infer<typeof wardSchema>;
export type Agency = z.infer<typeof agencySchema>;
export type Category = z.infer<typeof categorySchema>;
export type RoutingRule = z.infer<typeof routingRuleSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Validation = z.infer<typeof validationSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Dependency = z.infer<typeof dependencySchema>;
export type RoadSegment = z.infer<typeof roadSegmentSchema>;
export type Intervention = z.infer<typeof interventionSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type AdminConfig = z.infer<typeof adminConfigSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
