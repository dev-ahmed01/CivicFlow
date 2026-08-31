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
] as const;

export type OperationalMetricKey = (typeof operationalMetricKeys)[number];

export type OperationalMetric = {
  key: OperationalMetricKey;
  label: string;
  value: number | null;
  unit: "count" | "hours" | "percent";
  numerator?: number;
  denominator?: number;
  sampleSize?: number;
  description: string;
};

export type OperationalRecord = {
  id: string;
  recordType: "conflict" | "dependency" | "work" | "coordination" | "road-conflict" | "completion";
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
  workBreakdown: {
    byAgency: OperationalBreakdownRow[];
    byWard: OperationalBreakdownRow[];
    byType: OperationalBreakdownRow[];
  };
  conservationInputs: {
    repeatedRiskSegments: number;
    affectedLengthMeters: number;
    acceptedSequencingRecommendations: number;
    note: string;
  };
};
