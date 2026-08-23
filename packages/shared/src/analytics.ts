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
  simulatedRestorationCostSaved: {
    amountInr: number;
    label: "Simulated/Illustrative";
    formula: string;
    unitCostPerMeterInr: number;
    avoidedReworkFactor: number;
    qualifyingAcceptedRecommendations: number;
    affectedLengthMeters: number;
  };
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
    simulatedRestorationCostSaved: AnalyticsReport["simulatedRestorationCostSaved"];
  };
  privacyNotice: string;
};
