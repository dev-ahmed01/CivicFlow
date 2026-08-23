ALTER TYPE "ValidationVote" ADD VALUE IF NOT EXISTS 'NOT_SURE';

ALTER TABLE "User"
  ADD COLUMN "lastKnownCoordinates" geometry(Point,4326);

ALTER TABLE "Validation"
  ADD COLUMN "counted" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ValidationRequest" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "citizenId" UUID NOT NULL,
  "batchNumber" INTEGER NOT NULL,
  "distanceMeters" DOUBLE PRECISION NOT NULL,
  "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "ValidationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_lastKnownCoordinates_gist_idx" ON "User" USING GIST ("lastKnownCoordinates");
CREATE INDEX "Validation_validatorId_createdAt_idx" ON "Validation"("validatorId", "createdAt");
CREATE UNIQUE INDEX "ValidationRequest_ticketId_citizenId_key" ON "ValidationRequest"("ticketId", "citizenId");
CREATE INDEX "ValidationRequest_ticketId_batchNumber_idx" ON "ValidationRequest"("ticketId", "batchNumber");
CREATE INDEX "ValidationRequest_citizenId_expiresAt_idx" ON "ValidationRequest"("citizenId", "expiresAt");
CREATE INDEX "ValidationRequest_expiresAt_idx" ON "ValidationRequest"("expiresAt");

ALTER TABLE "ValidationRequest" ADD CONSTRAINT "ValidationRequest_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationRequest" ADD CONSTRAINT "ValidationRequest_citizenId_fkey"
  FOREIGN KEY ("citizenId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
