-- Part III §11 — align the persisted project state machine with the Phase 6 vocabulary.
ALTER TYPE "TicketState" RENAME VALUE 'PENDING_CITIZEN_VERIFICATION' TO 'AWAITING_CITIZEN_VERIFICATION';
ALTER TYPE "ProjectState" RENAME VALUE 'ENGINEER_ASSIGNED' TO 'PENDING_UPTAKE';
ALTER TYPE "ProjectState" RENAME VALUE 'ACCEPTED' TO 'UPTAKEN';
ALTER TYPE "ProjectState" RENAME VALUE 'WORK_IN_PROGRESS' TO 'ACTIVE';
ALTER TYPE "ProjectState" RENAME VALUE 'WORK_COMPLETED' TO 'COMPLETED';
ALTER TYPE "ProjectState" RENAME VALUE 'PENDING_CITIZEN_VERIFICATION' TO 'AWAITING_VERIFICATION';
ALTER TYPE "ProjectState" ADD VALUE 'MODIFIED' AFTER 'ACTIVE';

CREATE TYPE "CompletionVerificationDecision" AS ENUM ('VERIFIED', 'REWORK_REQUESTED');

ALTER TABLE "Project"
  ADD COLUMN "workDescription" TEXT,
  ADD COLUMN "dependencyFlags" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ProjectStateTransition" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "fromState" "ProjectState",
  "toState" "ProjectState" NOT NULL,
  "reason" TEXT NOT NULL,
  "actedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectWorkNote" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectWorkNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompletionEvidence" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "submittedById" UUID NOT NULL,
  "photoUrl" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletionEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompletionVerificationRequest" (
  "id" UUID NOT NULL,
  "completionEvidenceId" UUID NOT NULL,
  "citizenId" UUID NOT NULL,
  "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "CompletionVerificationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompletionVerification" (
  "id" UUID NOT NULL,
  "completionEvidenceId" UUID NOT NULL,
  "validatorId" UUID NOT NULL,
  "decision" "CompletionVerificationDecision" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompletionVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectStateTransition_projectId_createdAt_idx" ON "ProjectStateTransition"("projectId", "createdAt");
CREATE INDEX "ProjectStateTransition_actedById_idx" ON "ProjectStateTransition"("actedById");
CREATE INDEX "ProjectWorkNote_projectId_createdAt_idx" ON "ProjectWorkNote"("projectId", "createdAt");
CREATE INDEX "ProjectWorkNote_authorId_idx" ON "ProjectWorkNote"("authorId");
CREATE UNIQUE INDEX "CompletionEvidence_objectKey_key" ON "CompletionEvidence"("objectKey");
CREATE INDEX "CompletionEvidence_projectId_createdAt_idx" ON "CompletionEvidence"("projectId", "createdAt");
CREATE INDEX "CompletionEvidence_ticketId_idx" ON "CompletionEvidence"("ticketId");
CREATE INDEX "CompletionEvidence_submittedById_idx" ON "CompletionEvidence"("submittedById");
CREATE UNIQUE INDEX "CompletionVerificationRequest_completionEvidenceId_citizenId_key" ON "CompletionVerificationRequest"("completionEvidenceId", "citizenId");
CREATE INDEX "CompletionVerificationRequest_citizenId_respondedAt_idx" ON "CompletionVerificationRequest"("citizenId", "respondedAt");
CREATE UNIQUE INDEX "CompletionVerification_completionEvidenceId_validatorId_key" ON "CompletionVerification"("completionEvidenceId", "validatorId");
CREATE INDEX "CompletionVerification_validatorId_createdAt_idx" ON "CompletionVerification"("validatorId", "createdAt");

ALTER TABLE "ProjectStateTransition" ADD CONSTRAINT "ProjectStateTransition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStateTransition" ADD CONSTRAINT "ProjectStateTransition_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkNote" ADD CONSTRAINT "ProjectWorkNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkNote" ADD CONSTRAINT "ProjectWorkNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompletionEvidence" ADD CONSTRAINT "CompletionEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionEvidence" ADD CONSTRAINT "CompletionEvidence_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionEvidence" ADD CONSTRAINT "CompletionEvidence_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompletionVerificationRequest" ADD CONSTRAINT "CompletionVerificationRequest_completionEvidenceId_fkey" FOREIGN KEY ("completionEvidenceId") REFERENCES "CompletionEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionVerificationRequest" ADD CONSTRAINT "CompletionVerificationRequest_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionVerification" ADD CONSTRAINT "CompletionVerification_completionEvidenceId_fkey" FOREIGN KEY ("completionEvidenceId") REFERENCES "CompletionEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionVerification" ADD CONSTRAINT "CompletionVerification_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
