import { z } from "zod";

const idSchema = z.string().uuid();

export const analyticsFilterSchema = z.object({
  wardId: idSchema.optional(),
  categoryId: idSchema.optional(),
  agencyId: idSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "from must be before to", path: ["from"] });
  }
});

export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

export type MetricRow = {
  dimension: string;
  dimensionId?: string;
  secondaryDimension?: string;
  secondaryDimensionId?: string;
  count?: number;
  total?: number;
  ratePercent?: number;
  averageHours?: number;
  accepted?: number;
  modified?: number;
  dismissed?: number;
};

export type AnalyticsReport = {
  generatedAt: string;
  filters: {
    wardId?: string;
    categoryId?: string;
    agencyId?: string;
    from?: string;
    to?: string;
  };
  totals: {
    ticketsCreated: number;
    ticketsResolved: number;
    resolutionRatePercent: number;
    roadConflicts: number;
  };
  ticketsByCategory: MetricRow[];
  ticketsByWard: MetricRow[];
  ticketsByPeriod: MetricRow[];
  validationTimeByWard: MetricRow[];
  inspectionTimeByAgency: MetricRow[];
  resolutionTimeByCategoryAgency: MetricRow[];
  dependencyResponseByAgency: MetricRow[];
  dependencyEscalationByAgency: MetricRow[];
  validatorParticipationByWard: MetricRow[];
  conflictsByWardAgencyPair: MetricRow[];
  reworkByAgencyEngineer: MetricRow[];
  citizenNotResolvedByAgency: MetricRow[];
  roadConflictsByWardType: MetricRow[];
  repeatedExcavationsAvoidedBySegmentAgency: MetricRow[];
  sequencingOutcomesByAgency: MetricRow[];
};

export type PublicDashboard = {
  generatedAt: string;
  totals: AnalyticsReport["totals"];
  categoryBreakdown: MetricRow[];
  agencyPerformance: Array<{
    agencyId: string;
    agency: string;
    created: number;
    resolved: number;
    resolutionRatePercent: number;
    averageResolutionHours: number | null;
  }>;
  roadMetrics: {
    conflictsByType: MetricRow[];
  };
  privacyNotice: string;
};

export const operationalMetricKeys = [
  "conflicts-before-execution",
  "conflicts-resolved",
  "dependency-response-time",
  "works-blocked",
  "coordination-turnaround",
  "repeated-excavation",
  "first-time-completion",
  "verified-closure",
  "overdue-coordination",
  "evidence-backed-completion",
  "rework-rate",
  "risks-addressed",
  "coordinated-road-length",
  "sequencing-accepted",
  "works-coordinated",
] as const;

export type OperationalMetricKey = (typeof operationalMetricKeys)[number];

export type OperationalMetric = {
  key: OperationalMetricKey;
  label: string;
  value: number | null;
  unit: "count" | "hours" | "percent" | "meters";
  numerator?: number;
  denominator?: number;
  sampleSize?: number;
  description: string;
  direction: "higher" | "lower" | "context";
  limitedSample: boolean;
  previous: { value: number | null; numerator?: number; denominator?: number; sampleSize?: number };
  comparison: { change: number | null; relativePercent: number | null; interpretation: "Improved" | "Declined" | "Unchanged" | "No comparable data" | "Context only" };
};

export type OperationalRecord = {
  id: string;
  recordType: "conflict" | "dependency" | "work" | "coordination" | "road-conflict" | "completion" | "sequencing" | "intervention";
  reference: string;
  title: string;
  status: string;
  agency: string;
  counterpartAgency?: string;
  ward?: string;
  category?: string;
  occurredAt?: string;
  deadline?: string;
  durationHours?: number;
  relatedReference?: string;
  detail?: string;
  projectId?: string;
  included?: boolean;
  executionStart?: string;
  responseAt?: string;
  uploadedAt?: string;
  coordinationStatus?: string;
  evidenceIds?: string[];
  lengthMeters?: number;
};

export type OperationalBreakdownRow = {
  dimension: string;
  dimensionId?: string;
  count: number;
  records: OperationalRecord[];
};

export type OperationalAnalyticsReport = {
  generatedAt: string;
  filters: AnalyticsReport["filters"];
  metrics: OperationalMetric[];
  details: Record<OperationalMetricKey, OperationalRecord[]>;
  previousDetails: Record<OperationalMetricKey, OperationalRecord[]>;
  periods: InsightsPeriods;
  sampleThreshold: number;
  containsDemoRecords: boolean;
  dimensions: Array<{ kind: "ward" | "category"; id: string; name: string; metrics: OperationalMetric[] }>;
  options: { wards: Array<{ id: string; name: string }>; categories: Array<{ id: string; name: string }> };
  trend: Array<{ from: string; to: string; metrics: OperationalMetric[] }>;
  validation: InsightsBenchmark | null;
  notes: string[];
};

export const insightsPresetSchema = z.enum(["today", "last7", "last30", "week", "month", "custom"]);
export type InsightsPreset = z.infer<typeof insightsPresetSchema>;
export type InsightsPeriods = { current: { from: string; to: string }; previous: { from: string; to: string }; label: string; timeZone: "Asia/Kolkata"; partial: boolean };
export const insightsBenchmarkSchema = z.object({
  version: z.literal(1), generatedAt: z.string().datetime(), revision: z.string(),
  suites: z.array(z.object({ name: z.string(), scope: z.string(), correct: z.number().int().nonnegative(), total: z.number().int().positive(),
    cases: z.array(z.object({ name: z.string(), expected: z.string(), actual: z.string(), passed: z.boolean() })),
    confusion: z.object({ tp: z.number(), fp: z.number(), tn: z.number(), fn: z.number() }).optional(),
  })),
});
export type InsightsBenchmark = z.infer<typeof insightsBenchmarkSchema>;
