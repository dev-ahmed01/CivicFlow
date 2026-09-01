CREATE TYPE "ReassignmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');
CREATE TYPE "ProjectBlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "ProjectReassignmentRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "decidedById" UUID,
  "newEngineerId" UUID,
  "reason" VARCHAR(80) NOT NULL,
  "note" TEXT,
  "availableFrom" TIMESTAMP(3),
  "status" "ReassignmentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectReassignmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectBlocker" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "reportedById" UUID NOT NULL,
  "resolvedById" UUID,
  "title" VARCHAR(180) NOT NULL,
  "details" TEXT NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "status" "ProjectBlockerStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectBlocker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectReassignmentRequest_projectId_status_idx" ON "ProjectReassignmentRequest"("projectId", "status");
CREATE INDEX "ProjectReassignmentRequest_requestedById_createdAt_idx" ON "ProjectReassignmentRequest"("requestedById", "createdAt");
CREATE INDEX "ProjectBlocker_projectId_status_idx" ON "ProjectBlocker"("projectId", "status");
CREATE INDEX "ProjectBlocker_status_createdAt_idx" ON "ProjectBlocker"("status", "createdAt");

ALTER TABLE "ProjectReassignmentRequest" ADD CONSTRAINT "ProjectReassignmentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReassignmentRequest" ADD CONSTRAINT "ProjectReassignmentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectReassignmentRequest" ADD CONSTRAINT "ProjectReassignmentRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectReassignmentRequest" ADD CONSTRAINT "ProjectReassignmentRequest_newEngineerId_fkey" FOREIGN KEY ("newEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectBlocker" ADD CONSTRAINT "ProjectBlocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBlocker" ADD CONSTRAINT "ProjectBlocker_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectBlocker" ADD CONSTRAINT "ProjectBlocker_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
