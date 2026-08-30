-- Phase 4 integration — preserve the originating warning and opposing work on
-- every coordination request without changing either conflict engine.
ALTER TABLE "CoordinationRequest"
  ADD COLUMN "conflictLogId" UUID,
  ADD COLUMN "roadConflictLogId" UUID,
  ADD COLUMN "conflictingProjectId" UUID;

ALTER TABLE "Dependency" ADD COLUMN "deadlineReminderSentAt" TIMESTAMP(3);

CREATE INDEX "CoordinationRequest_conflictLogId_idx" ON "CoordinationRequest"("conflictLogId");
CREATE INDEX "CoordinationRequest_roadConflictLogId_idx" ON "CoordinationRequest"("roadConflictLogId");
CREATE INDEX "CoordinationRequest_conflictingProjectId_idx" ON "CoordinationRequest"("conflictingProjectId");

ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_conflictLogId_fkey"
  FOREIGN KEY ("conflictLogId") REFERENCES "ConflictLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_roadConflictLogId_fkey"
  FOREIGN KEY ("roadConflictLogId") REFERENCES "RoadConflictLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoordinationRequest" ADD CONSTRAINT "CoordinationRequest_conflictingProjectId_fkey"
  FOREIGN KEY ("conflictingProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
