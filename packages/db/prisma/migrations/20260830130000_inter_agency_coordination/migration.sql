CREATE TYPE "CoordinationStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'ACKNOWLEDGED',
  'CLARIFICATION_REQUESTED',
  'INSPECTION_REQUIRED',
  'ENGINEER_ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'REJECTED'
);

CREATE TABLE "CoordinationRequest" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "dependencyId" UUID,
  "requestingAgencyId" UUID NOT NULL,
  "respondingAgencyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "assignedEngineerId" UUID,
  "requestTypeKey" VARCHAR(80) NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "details" TEXT NOT NULL,
  "responseDeadline" TIMESTAMP(3) NOT NULL,
  "inspectionNeeded" BOOLEAN NOT NULL DEFAULT false,
  "engineerRequired" BOOLEAN NOT NULL DEFAULT false,
  "proposedAt" TIMESTAMP(3),
  "inspectionCompletedAt" TIMESTAMP(3),
  "status" "CoordinationStatus" NOT NULL DEFAULT 'DRAFT',
  "sentAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoordinationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoordinationEntry" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "senderAgencyId" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "message" TEXT,
  "fromStatus" "CoordinationStatus",
  "toStatus" "CoordinationStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoordinationEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoordinationAttachment" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "uploadedById" UUID NOT NULL,
  "fileName" VARCHAR(200) NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoordinationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoordinationRequest_dependencyId_idx" ON "CoordinationRequest"("dependencyId");
CREATE UNIQUE INDEX "CoordinationAttachment_objectKey_key" ON "CoordinationAttachment"("objectKey");
CREATE INDEX "CoordinationRequest_projectId_createdAt_idx" ON "CoordinationRequest"("projectId", "createdAt");
CREATE INDEX "CoordinationRequest_requestingAgencyId_status_responseDeadline_idx" ON "CoordinationRequest"("requestingAgencyId", "status", "responseDeadline");
CREATE INDEX "CoordinationRequest_respondingAgencyId_status_responseDeadline_idx" ON "CoordinationRequest"("respondingAgencyId", "status", "responseDeadline");
CREATE INDEX "CoordinationRequest_assignedEngineerId_status_idx" ON "CoordinationRequest"("assignedEngineerId", "status");
CREATE INDEX "CoordinationEntry_requestId_createdAt_idx" ON "CoordinationEntry"("requestId", "createdAt");
CREATE INDEX "CoordinationEntry_senderId_idx" ON "CoordinationEntry"("senderId");
CREATE INDEX "CoordinationAttachment_requestId_createdAt_idx" ON "CoordinationAttachment"("requestId", "createdAt");
CREATE INDEX "CoordinationAttachment_entryId_idx" ON "CoordinationAttachment"("entryId");
CREATE INDEX "CoordinationAttachment_uploadedById_idx" ON "CoordinationAttachment"("uploadedById");

ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "Dependency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_requestingAgencyId_fkey" FOREIGN KEY ("requestingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_respondingAgencyId_fkey" FOREIGN KEY ("respondingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_assignedEngineerId_fkey" FOREIGN KEY ("assignedEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoordinationEntry" ADD CONSTRAINT "CoordinationEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoordinationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoordinationEntry" ADD CONSTRAINT "CoordinationEntry_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoordinationEntry" ADD CONSTRAINT "CoordinationEntry_senderAgencyId_fkey" FOREIGN KEY ("senderAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CoordinationAttachment" ADD CONSTRAINT "CoordinationAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CoordinationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoordinationAttachment" ADD CONSTRAINT "CoordinationAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CoordinationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoordinationAttachment" ADD CONSTRAINT "CoordinationAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AdminConfig" ("key", "value", "description")
VALUES (
  'coordination.request_types',
  '["utility-clearance","dependency-request","joint-inspection","engineer-assistance","document-information-request","schedule-coordination","road-cut-excavation-coordination","other"]'::jsonb,
  'Configurable structured request types available in the inter-agency coordination workspace'
)
ON CONFLICT ("key") DO NOTHING;
