CREATE TYPE "RoadConflictType" AS ENUM (
  'SPATIAL',
  'TEMPORAL',
  'SEQUENCING_VIOLATION',
  'RESTORATION_TOO_EARLY',
  'REPEATED_EXCAVATION_RISK',
  'DUPLICATE_INTERVENTION'
);

CREATE TYPE "RoadConflictSeverity" AS ENUM ('HIGH', 'MEDIUM_HIGH', 'MEDIUM');
CREATE TYPE "SequencingRecommendationOutcome" AS ENUM ('ACCEPTED', 'MODIFIED', 'DISMISSED');

ALTER TABLE "Intervention"
  ADD COLUMN "startOffsetM" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Ticket" ADD COLUMN "roadSegmentId" UUID;
CREATE INDEX "Ticket_roadSegmentId_idx" ON "Ticket"("roadSegmentId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_roadSegmentId_fkey" FOREIGN KEY ("roadSegmentId") REFERENCES "RoadSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Intervention"
  ADD CONSTRAINT "Intervention_start_offset_check" CHECK ("startOffsetM" >= 0);

CREATE TABLE "RoadConflictLog" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "conflictingProjectId" UUID,
  "segmentId" UUID NOT NULL,
  "projectAgencyId" UUID NOT NULL,
  "conflictingAgencyId" UUID,
  "type" "RoadConflictType" NOT NULL,
  "severity" "RoadConflictSeverity" NOT NULL,
  "reason" TEXT NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadConflictLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoadConflictLog_distinct_projects_check" CHECK ("conflictingProjectId" IS NULL OR "projectId" <> "conflictingProjectId")
);

CREATE UNIQUE INDEX "RoadConflictLog_projectId_type_fingerprint_key" ON "RoadConflictLog"("projectId", "type", "fingerprint");
CREATE INDEX "RoadConflictLog_projectId_createdAt_idx" ON "RoadConflictLog"("projectId", "createdAt");
CREATE INDEX "RoadConflictLog_conflictingProjectId_createdAt_idx" ON "RoadConflictLog"("conflictingProjectId", "createdAt");
CREATE INDEX "RoadConflictLog_segmentId_createdAt_idx" ON "RoadConflictLog"("segmentId", "createdAt");

CREATE TABLE "SequencingRecommendation" (
  "id" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "projectIds" JSONB NOT NULL,
  "proposedOrder" JSONB NOT NULL,
  "explanation" TEXT NOT NULL,
  "ruleTrace" JSONB NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SequencingRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SequencingRecommendation_fingerprint_key" ON "SequencingRecommendation"("fingerprint");
CREATE INDEX "SequencingRecommendation_segmentId_updatedAt_idx" ON "SequencingRecommendation"("segmentId", "updatedAt");

CREATE TABLE "SequencingRecommendationLog" (
  "id" UUID NOT NULL,
  "recommendationId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "proposedOrder" JSONB NOT NULL,
  "outcome" "SequencingRecommendationOutcome" NOT NULL,
  "actedById" UUID NOT NULL,
  "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SequencingRecommendationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SequencingRecommendationLog_recommendationId_actedAt_idx" ON "SequencingRecommendationLog"("recommendationId", "actedAt");
CREATE INDEX "SequencingRecommendationLog_segmentId_actedAt_idx" ON "SequencingRecommendationLog"("segmentId", "actedAt");
CREATE INDEX "SequencingRecommendationLog_actedById_idx" ON "SequencingRecommendationLog"("actedById");

ALTER TABLE "RoadConflictLog" ADD CONSTRAINT "RoadConflictLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadConflictLog" ADD CONSTRAINT "RoadConflictLog_conflictingProjectId_fkey" FOREIGN KEY ("conflictingProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadConflictLog" ADD CONSTRAINT "RoadConflictLog_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadConflictLog" ADD CONSTRAINT "RoadConflictLog_projectAgencyId_fkey" FOREIGN KEY ("projectAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadConflictLog" ADD CONSTRAINT "RoadConflictLog_conflictingAgencyId_fkey" FOREIGN KEY ("conflictingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SequencingRecommendation" ADD CONSTRAINT "SequencingRecommendation_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequencingRecommendationLog" ADD CONSTRAINT "SequencingRecommendationLog_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "SequencingRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequencingRecommendationLog" ADD CONSTRAINT "SequencingRecommendationLog_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequencingRecommendationLog" ADD CONSTRAINT "SequencingRecommendationLog_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AdminConfig" ("key", "value", "description")
VALUES (
  'road.repeated_excavation_days',
  '90'::jsonb,
  'Days after restoration during which a new excavation receives an advisory warning'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AdminConfig" ("key", "value", "description")
SELECT
  'road.category_id',
  to_jsonb("id"::text),
  'Admin-configured category that enables Road-Cutting Intelligence'
FROM "Category"
WHERE LOWER("name") = 'road damage'
ON CONFLICT ("key") DO NOTHING;
