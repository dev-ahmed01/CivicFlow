CREATE TYPE "WorkflowActionType" AS ENUM (
  'INSPECT_TICKET',
  'CREATE_PROJECT',
  'ASSIGN_ENGINEER',
  'ACCEPT_PROJECT',
  'SET_TIMELINE',
  'COMPLETE_WORK',
  'SUBMIT_COMPLETION',
  'RESPOND_DEPENDENCY',
  'FULFILL_DEPENDENCY',
  'REVIEW_GRIEVANCE'
);

CREATE TYPE "GrievanceSource" AS ENUM ('AUTO_NON_RESPONSE', 'CITIZEN');
CREATE TYPE "GrievanceStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REOPENED');

CREATE TABLE "WorkflowAction" (
  "id" UUID NOT NULL,
  "dedupeKey" VARCHAR(220) NOT NULL,
  "type" "WorkflowActionType" NOT NULL,
  "ticketId" UUID NOT NULL,
  "projectId" UUID,
  "dependencyId" UUID,
  "responsibleUserId" UUID NOT NULL,
  "responsibleAgencyId" UUID NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "attentionNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Grievance" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "projectId" UUID,
  "dependencyId" UUID,
  "actionId" UUID,
  "raisedByUserId" UUID,
  "responsibleUserId" UUID,
  "responsibleAgencyId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "evidenceUrl" TEXT,
  "evidenceObjectKey" TEXT,
  "evidenceContentType" TEXT,
  "evidenceUploadedAt" TIMESTAMP(3),
  "source" "GrievanceSource" NOT NULL,
  "status" "GrievanceStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "escalatedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowAction_dedupeKey_key" ON "WorkflowAction"("dedupeKey");
CREATE INDEX "WorkflowAction_responsibleUserId_respondedAt_deadline_idx" ON "WorkflowAction"("responsibleUserId", "respondedAt", "deadline");
CREATE INDEX "WorkflowAction_responsibleAgencyId_respondedAt_deadline_idx" ON "WorkflowAction"("responsibleAgencyId", "respondedAt", "deadline");
CREATE INDEX "WorkflowAction_ticketId_idx" ON "WorkflowAction"("ticketId");
CREATE INDEX "WorkflowAction_projectId_idx" ON "WorkflowAction"("projectId");
CREATE INDEX "WorkflowAction_dependencyId_idx" ON "WorkflowAction"("dependencyId");

CREATE UNIQUE INDEX "Grievance_actionId_key" ON "Grievance"("actionId");
CREATE UNIQUE INDEX "Grievance_evidenceObjectKey_key" ON "Grievance"("evidenceObjectKey");
CREATE INDEX "Grievance_ticketId_status_createdAt_idx" ON "Grievance"("ticketId", "status", "createdAt");
CREATE INDEX "Grievance_projectId_status_idx" ON "Grievance"("projectId", "status");
CREATE INDEX "Grievance_dependencyId_status_idx" ON "Grievance"("dependencyId", "status");
CREATE INDEX "Grievance_responsibleAgencyId_status_createdAt_idx" ON "Grievance"("responsibleAgencyId", "status", "createdAt");
CREATE INDEX "Grievance_responsibleUserId_status_createdAt_idx" ON "Grievance"("responsibleUserId", "status", "createdAt");
CREATE INDEX "Grievance_raisedByUserId_createdAt_idx" ON "Grievance"("raisedByUserId", "createdAt");

ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "Dependency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_responsibleAgencyId_fkey" FOREIGN KEY ("responsibleAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "Dependency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "WorkflowAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_responsibleAgencyId_fkey" FOREIGN KEY ("responsibleAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill only currently actionable work. Historical/responded records remain untouched.
INSERT INTO "WorkflowAction" ("id", "dedupeKey", "type", "ticketId", "responsibleUserId", "responsibleAgencyId", "deadline", "createdAt")
SELECT gen_random_uuid(), 'ticket:' || t."id" || ':inspect', 'INSPECT_TICKET'::"WorkflowActionType", t."id", u."id", t."assignedAgencyId",
  t."createdAt" + INTERVAL '3 days', t."createdAt"
FROM "Ticket" t
JOIN LATERAL (
  SELECT "id" FROM "User" WHERE "agencyId" = t."assignedAgencyId" AND "role" = 'PROJECT_HEAD'::"UserRole" ORDER BY "createdAt", "id" LIMIT 1
) u ON TRUE
WHERE t."state" IN ('ROUTED_TO_AGENCY'::"TicketState", 'INSPECTION_DUE'::"TicketState")
ON CONFLICT ("dedupeKey") DO NOTHING;

INSERT INTO "WorkflowAction" ("id", "dedupeKey", "type", "ticketId", "projectId", "responsibleUserId", "responsibleAgencyId", "deadline", "createdAt")
SELECT gen_random_uuid(),
  CASE WHEN p."state" = 'PENDING_UPTAKE'::"ProjectState" THEN 'project:' || p."id" || ':accept'
       WHEN p."state" = 'UPTAKEN'::"ProjectState" THEN 'project:' || p."id" || ':timeline'
       WHEN p."state" = 'ACTIVE'::"ProjectState" THEN 'project:' || p."id" || ':complete-work'
       ELSE 'project:' || p."id" || ':submit-completion' END,
  CASE WHEN p."state" = 'PENDING_UPTAKE'::"ProjectState" THEN 'ACCEPT_PROJECT'::"WorkflowActionType"
       WHEN p."state" = 'UPTAKEN'::"ProjectState" THEN 'SET_TIMELINE'::"WorkflowActionType"
       WHEN p."state" = 'ACTIVE'::"ProjectState" THEN 'COMPLETE_WORK'::"WorkflowActionType"
       ELSE 'SUBMIT_COMPLETION'::"WorkflowActionType" END,
  p."ticketId", p."id", p."engineerId", p."agencyId",
  CASE WHEN p."state" = 'ACTIVE'::"ProjectState" AND p."plannedEnd" IS NOT NULL THEN p."plannedEnd" ELSE p."createdAt" + INTERVAL '3 days' END,
  p."createdAt"
FROM "Project" p
WHERE p."ticketId" IS NOT NULL AND p."engineerId" IS NOT NULL
  AND p."state" IN ('PENDING_UPTAKE'::"ProjectState", 'UPTAKEN'::"ProjectState", 'ACTIVE'::"ProjectState", 'COMPLETED'::"ProjectState")
ON CONFLICT ("dedupeKey") DO NOTHING;

INSERT INTO "WorkflowAction" ("id", "dedupeKey", "type", "ticketId", "projectId", "dependencyId", "responsibleUserId", "responsibleAgencyId", "deadline", "createdAt")
SELECT gen_random_uuid(),
  CASE WHEN d."state" = 'ASSIGNED'::"DependencyState" THEN 'dependency:' || d."id" || ':fulfill'
       ELSE 'dependency:' || d."id" || ':respond:' || to_char(d."deadline" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
  CASE WHEN d."state" = 'ASSIGNED'::"DependencyState" THEN 'FULFILL_DEPENDENCY'::"WorkflowActionType" ELSE 'RESPOND_DEPENDENCY'::"WorkflowActionType" END,
  p."ticketId", p."id", d."id", COALESCE(d."assignedEngineerId", u."id"), d."respondingAgencyId", d."deadline", d."createdAt"
FROM "Dependency" d
JOIN "Project" p ON p."id" = d."projectId" AND p."ticketId" IS NOT NULL
LEFT JOIN LATERAL (
  SELECT "id" FROM "User" WHERE "agencyId" = d."respondingAgencyId" AND "role" IN ('PROJECT_HEAD'::"UserRole", 'ENGINEER'::"UserRole") ORDER BY "role", "createdAt", "id" LIMIT 1
) u ON TRUE
WHERE d."state" IN ('PENDING_RESPONSE'::"DependencyState", 'ASSIGNED'::"DependencyState")
  AND COALESCE(d."assignedEngineerId", u."id") IS NOT NULL
ON CONFLICT ("dedupeKey") DO NOTHING;
