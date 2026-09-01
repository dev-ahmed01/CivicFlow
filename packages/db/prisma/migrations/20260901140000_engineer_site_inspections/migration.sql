CREATE TYPE "InspectionStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED');
CREATE TYPE "InspectionIssueConfirmation" AS ENUM ('CONFIRMED', 'PARTIALLY_CONFIRMED', 'NOT_OBSERVED');
CREATE TYPE "InspectionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "InspectionComplexity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "InspectionRecommendation" AS ENUM ('PROCEED', 'COORDINATION_REQUIRED', 'ADDITIONAL_INVESTIGATION', 'NO_WORK_REQUIRED');
CREATE TYPE "InspectionReviewDecision" AS ENUM ('CREATE_WORK', 'ADDITIONAL_INSPECTION', 'NO_WORK_REQUIRED');

ALTER TYPE "WorkflowActionType" ADD VALUE IF NOT EXISTS 'ACCEPT_INSPECTION' AFTER 'INSPECT_TICKET';
ALTER TYPE "WorkflowActionType" ADD VALUE IF NOT EXISTS 'COMPLETE_INSPECTION' AFTER 'ACCEPT_INSPECTION';
ALTER TYPE "WorkflowActionType" ADD VALUE IF NOT EXISTS 'REVIEW_INSPECTION' AFTER 'COMPLETE_INSPECTION';

ALTER TABLE "InspectionReport"
  ADD COLUMN "assignedEngineerId" UUID,
  ADD COLUMN "assignedById" UUID,
  ADD COLUMN "reviewedById" UUID,
  ADD COLUMN "status" "InspectionStatus" NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN "deadline" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "issueConfirmation" "InspectionIssueConfirmation",
  ADD COLUMN "severity" "InspectionSeverity",
  ADD COLUMN "observations" TEXT,
  ADD COLUMN "recommendedWork" TEXT,
  ADD COLUMN "complexity" "InspectionComplexity",
  ADD COLUMN "coordinationRequired" BOOLEAN,
  ADD COLUMN "otherAgencyInvolvement" TEXT,
  ADD COLUMN "recommendation" "InspectionRecommendation",
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "locationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "reviewDecision" "InspectionReviewDecision",
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "InspectionReport"
SET "assignedEngineerId" = "submittedById",
    "assignedById" = "submittedById",
    "status" = CASE WHEN "uploadedAt" IS NULL THEN 'IN_PROGRESS'::"InspectionStatus" ELSE 'SUBMITTED'::"InspectionStatus" END,
    "deadline" = "createdAt" + INTERVAL '3 days',
    "startedAt" = "createdAt",
    "submittedAt" = "uploadedAt",
    "observations" = "notes";

ALTER TABLE "InspectionReport"
  ALTER COLUMN "assignedEngineerId" SET NOT NULL,
  ALTER COLUMN "assignedById" SET NOT NULL,
  ALTER COLUMN "deadline" SET NOT NULL,
  ALTER COLUMN "submittedById" DROP NOT NULL,
  ALTER COLUMN "fileUrl" DROP NOT NULL,
  ALTER COLUMN "objectKey" DROP NOT NULL,
  ALTER COLUMN "contentType" DROP NOT NULL,
  ALTER COLUMN "notes" DROP NOT NULL;

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_assignedEngineerId_fkey" FOREIGN KEY ("assignedEngineerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InspectionReport_assignedEngineerId_status_deadline_idx" ON "InspectionReport"("assignedEngineerId", "status", "deadline");
CREATE INDEX "InspectionReport_assignedById_idx" ON "InspectionReport"("assignedById");
CREATE INDEX "InspectionReport_reviewedById_idx" ON "InspectionReport"("reviewedById");

CREATE TABLE "InspectionEvidence" (
  "id" UUID NOT NULL,
  "inspectionId" UUID NOT NULL,
  "uploadedById" UUID NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InspectionEvidence_objectKey_key" ON "InspectionEvidence"("objectKey");
CREATE INDEX "InspectionEvidence_inspectionId_createdAt_idx" ON "InspectionEvidence"("inspectionId", "createdAt");
CREATE INDEX "InspectionEvidence_uploadedById_idx" ON "InspectionEvidence"("uploadedById");
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "InspectionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionEvidence" ADD CONSTRAINT "InspectionEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
