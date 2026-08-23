-- Part III §13.3 — conflict severity changes presentation only; neither value blocks a save.
CREATE TYPE "ConflictSeverity" AS ENUM ('PROMINENT', 'INLINE');

CREATE TABLE "ConflictLog" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "conflictingProjectId" UUID NOT NULL,
  "projectAgencyId" UUID NOT NULL,
  "conflictingAgencyId" UUID NOT NULL,
  "projectTimelineStart" TIMESTAMP(3) NOT NULL,
  "projectTimelineEnd" TIMESTAMP(3) NOT NULL,
  "conflictingTimelineStart" TIMESTAMP(3) NOT NULL,
  "conflictingTimelineEnd" TIMESTAMP(3) NOT NULL,
  "overlapStart" TIMESTAMP(3) NOT NULL,
  "overlapEnd" TIMESTAMP(3) NOT NULL,
  "locationDescription" TEXT NOT NULL,
  "distanceMeters" DOUBLE PRECISION,
  "severity" "ConflictSeverity" NOT NULL,
  "timelineFingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConflictLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConflictLog_distinct_projects_check" CHECK ("projectId" <> "conflictingProjectId"),
  CONSTRAINT "ConflictLog_overlap_order_check" CHECK ("overlapStart" <= "overlapEnd")
);

CREATE UNIQUE INDEX "ConflictLog_projectId_conflictingProjectId_timelineFingerprint_key"
  ON "ConflictLog"("projectId", "conflictingProjectId", "timelineFingerprint");
CREATE INDEX "ConflictLog_projectId_createdAt_idx" ON "ConflictLog"("projectId", "createdAt");
CREATE INDEX "ConflictLog_conflictingProjectId_createdAt_idx" ON "ConflictLog"("conflictingProjectId", "createdAt");
CREATE INDEX "ConflictLog_conflictingAgencyId_idx" ON "ConflictLog"("conflictingAgencyId");

ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_conflictingProjectId_fkey"
  FOREIGN KEY ("conflictingProjectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_projectAgencyId_fkey"
  FOREIGN KEY ("projectAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConflictLog" ADD CONSTRAINT "ConflictLog_conflictingAgencyId_fkey"
  FOREIGN KEY ("conflictingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Part III §13.2 — the threshold is data, not application logic.
INSERT INTO "AdminConfig" ("key", "value", "description")
VALUES ('conflict.radius_meters', '200'::jsonb, 'Default generic project conflict radius')
ON CONFLICT ("key") DO NOTHING;
