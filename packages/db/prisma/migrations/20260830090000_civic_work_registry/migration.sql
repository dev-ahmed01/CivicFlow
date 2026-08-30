-- Phase 1 — make Project the canonical Civic Work Registry without replacing
-- ticket, dependency, conflict, road-intelligence, or evidence tables.
CREATE TYPE "CivicWorkOrigin" AS ENUM ('AGENCY_PLANNED', 'CITIZEN_REPORTED', 'SYSTEM_INTEGRATION');
CREATE TYPE "CivicWorkPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ProjectEvidenceKind" AS ENUM ('PLANNING_DOCUMENT', 'SITE_PHOTO', 'PERMIT', 'INSPECTION', 'OTHER');

CREATE TABLE "CivicWorkReferenceCounter" (
    "period" VARCHAR(6) NOT NULL,
    "lastValue" INTEGER NOT NULL,
    CONSTRAINT "CivicWorkReferenceCounter_pkey" PRIMARY KEY ("period")
);

ALTER TABLE "Project"
    ADD COLUMN "referenceNumber" VARCHAR(24),
    ADD COLUMN "categoryId" UUID,
    ADD COLUMN "ownerProjectHeadId" UUID,
    ADD COLUMN "createdById" UUID,
    ADD COLUMN "updatedById" UUID,
    ADD COLUMN "origin" "CivicWorkOrigin" NOT NULL DEFAULT 'CITIZEN_REPORTED',
    ADD COLUMN "title" VARCHAR(180) NOT NULL DEFAULT 'Civic work',
    ADD COLUMN "description" TEXT,
    ADD COLUMN "locationLabel" TEXT,
    ADD COLUMN "geometry" geometry(Geometry,4326),
    ADD COLUMN "wardId" UUID,
    ADD COLUMN "priority" "CivicWorkPriority" NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN "actualStart" TIMESTAMP(3),
    ADD COLUMN "actualCompletion" TIMESTAMP(3),
    ADD COLUMN "cancelledAt" TIMESTAMP(3),
    ADD COLUMN "cancellationReason" TEXT;

-- Ticket-backed work retains its existing category, ward, address, source, and
-- point geometry. Agency-created tickets are classified as planned work.
UPDATE "Project" AS project
SET "categoryId" = ticket."categoryId",
    "wardId" = ticket."wardId",
    "origin" = CASE
        WHEN ticket."reporterId" IS NULL THEN 'AGENCY_PLANNED'::"CivicWorkOrigin"
        ELSE 'CITIZEN_REPORTED'::"CivicWorkOrigin"
    END,
    "title" = ticket."title",
    "description" = COALESCE(project."workDescription", (
        SELECT observation."note"
        FROM "Observation" AS observation
        WHERE observation."ticketId" = ticket."id"
        ORDER BY observation."createdAt" ASC
        LIMIT 1
    )),
    "locationLabel" = ticket."address",
    "geometry" = ticket."coordinates"
FROM "Ticket" AS ticket
WHERE ticket."id" = project."ticketId";

-- Road interventions use the authoritative road LineString rather than the
-- intake point and can backfill otherwise-standalone legacy road projects.
UPDATE "Project" AS project
SET "categoryId" = COALESCE(project."categoryId", (
        SELECT (config."value" #>> '{}')::uuid
        FROM "AdminConfig" AS config
        WHERE config."key" = 'road.category_id'
    )),
    "wardId" = segment."wardId",
    "geometry" = segment."geometry",
    "locationLabel" = COALESCE(project."locationLabel", segment."roadName")
FROM "Intervention" AS intervention
JOIN "RoadSegment" AS segment ON segment."id" = intervention."segmentId"
WHERE intervention."projectId" = project."id";

-- Existing state history supplies actual dates where available.
UPDATE "Project" AS project
SET "actualStart" = (
        SELECT MIN(transition."createdAt")
        FROM "ProjectStateTransition" AS transition
        WHERE transition."projectId" = project."id"
          AND transition."toState" = 'ACTIVE'::"ProjectState"
    ),
    "actualCompletion" = (
        SELECT MIN(transition."createdAt")
        FROM "ProjectStateTransition" AS transition
        WHERE transition."projectId" = project."id"
          AND transition."toState" IN ('COMPLETED'::"ProjectState", 'CLOSED'::"ProjectState")
    ),
    "cancelledAt" = (
        SELECT MIN(transition."createdAt")
        FROM "ProjectStateTransition" AS transition
        WHERE transition."projectId" = project."id"
          AND transition."toState" = 'CANCELLED'::"ProjectState"
    );

-- Retain a responsible Project Head and creator where the historical project
-- pre-dates explicit registry ownership metadata.
UPDATE "Project" AS project
SET "ownerProjectHeadId" = (
    SELECT "id"
    FROM "User"
    WHERE "agencyId" = project."agencyId"
      AND "role" = 'PROJECT_HEAD'::"UserRole"
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
),
    "createdById" = (
        SELECT "id"
        FROM "User"
        WHERE "agencyId" = project."agencyId"
          AND "role" = 'PROJECT_HEAD'::"UserRole"
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT 1
    ),
    "updatedById" = (
        SELECT "id"
        FROM "User"
        WHERE "agencyId" = project."agencyId"
          AND "role" = 'PROJECT_HEAD'::"UserRole"
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT 1
    );

-- A pre-existing standalone Project may have no retained intake geography or
-- category. Keep those legacy references nullable instead of inventing civic
-- data. Every new registry write validates and persists both references.

WITH numbered AS (
    SELECT "id",
           to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') AS period,
           row_number() OVER (
               PARTITION BY to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYYMM')
               ORDER BY "createdAt", "id"
           ) AS sequence
    FROM "Project"
)
UPDATE "Project" AS project
SET "referenceNumber" = 'CW' || numbered.period || lpad(numbered.sequence::text, 3, '0')
FROM numbered
WHERE project."id" = numbered."id";

INSERT INTO "CivicWorkReferenceCounter" ("period", "lastValue")
SELECT substring("referenceNumber" FROM 3 FOR 6), MAX(substring("referenceNumber" FROM 9)::integer)
FROM "Project"
GROUP BY substring("referenceNumber" FROM 3 FOR 6);

CREATE OR REPLACE FUNCTION next_civic_work_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    current_period text;
    next_value integer;
BEGIN
    current_period := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYYMM');
    INSERT INTO "CivicWorkReferenceCounter" ("period", "lastValue")
    VALUES (current_period, 1)
    ON CONFLICT ("period") DO UPDATE
    SET "lastValue" = "CivicWorkReferenceCounter"."lastValue" + 1
    RETURNING "lastValue" INTO next_value;

    RETURN 'CW' || current_period || lpad(next_value::text, 3, '0');
END;
$$;

ALTER TABLE "Project"
    ALTER COLUMN "referenceNumber" SET NOT NULL,
    ALTER COLUMN "referenceNumber" SET DEFAULT next_civic_work_reference();

CREATE TABLE "ProjectEvidence" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "ProjectEvidenceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "objectKey" TEXT,
    "contentType" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAuditEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "actorId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_referenceNumber_key" ON "Project"("referenceNumber");
CREATE INDEX "Project_categoryId_idx" ON "Project"("categoryId");
CREATE INDEX "Project_wardId_idx" ON "Project"("wardId");
CREATE INDEX "Project_ownerProjectHeadId_idx" ON "Project"("ownerProjectHeadId");
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX "Project_origin_idx" ON "Project"("origin");
CREATE INDEX "Project_priority_idx" ON "Project"("priority");
CREATE INDEX "Project_plannedStart_plannedEnd_idx" ON "Project"("plannedStart", "plannedEnd");
CREATE INDEX "Project_geometry_gist_idx" ON "Project" USING GIST ("geometry");
CREATE UNIQUE INDEX "ProjectEvidence_objectKey_key" ON "ProjectEvidence"("objectKey");
CREATE INDEX "ProjectEvidence_projectId_createdAt_idx" ON "ProjectEvidence"("projectId", "createdAt");
CREATE INDEX "ProjectEvidence_createdById_idx" ON "ProjectEvidence"("createdById");
CREATE INDEX "ProjectAuditEvent_projectId_createdAt_idx" ON "ProjectAuditEvent"("projectId", "createdAt");
CREATE INDEX "ProjectAuditEvent_actorId_idx" ON "ProjectAuditEvent"("actorId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerProjectHeadId_fkey" FOREIGN KEY ("ownerProjectHeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectAuditEvent" ADD CONSTRAINT "ProjectAuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAuditEvent" ADD CONSTRAINT "ProjectAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_planned_date_range_check"
CHECK ("plannedStart" IS NULL OR "plannedEnd" IS NULL OR "plannedEnd" >= "plannedStart");
ALTER TABLE "Project" ADD CONSTRAINT "Project_actual_date_range_check"
CHECK ("actualStart" IS NULL OR "actualCompletion" IS NULL OR "actualCompletion" >= "actualStart");
ALTER TABLE "Project" ADD CONSTRAINT "Project_cancellation_metadata_check"
CHECK ("state" <> 'CANCELLED'::"ProjectState" OR "cancelledAt" IS NOT NULL);
