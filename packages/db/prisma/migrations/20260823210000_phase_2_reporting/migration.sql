ALTER TABLE "Ticket"
  ADD COLUMN "title" VARCHAR(160) NOT NULL DEFAULT 'Civic issue',
  ADD COLUMN "address" TEXT NOT NULL DEFAULT 'Location pending',
  ADD COLUMN "aiRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "manualReviewRecommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "duplicateReviewRecommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "duplicateCandidateId" UUID,
  ADD COLUMN "duplicateVisualSimilarity" DOUBLE PRECISION,
  ADD COLUMN "duplicateVisualMatch" BOOLEAN;

ALTER TABLE "Observation"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "address" TEXT;

CREATE TABLE "Image" (
  "id" UUID NOT NULL,
  "observationId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "aiRelevanceScore" DOUBLE PRECISION,
  "embedding" JSONB,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketStateTransition" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "fromState" "TicketState",
  "toState" "TicketState" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Image_objectKey_key" ON "Image"("objectKey");
CREATE INDEX "Image_observationId_idx" ON "Image"("observationId");
CREATE INDEX "Image_observationId_isPrimary_idx" ON "Image"("observationId", "isPrimary");
CREATE INDEX "TicketStateTransition_ticketId_createdAt_idx" ON "TicketStateTransition"("ticketId", "createdAt");

ALTER TABLE "Image" ADD CONSTRAINT "Image_observationId_fkey"
  FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketStateTransition" ADD CONSTRAINT "TicketStateTransition_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
