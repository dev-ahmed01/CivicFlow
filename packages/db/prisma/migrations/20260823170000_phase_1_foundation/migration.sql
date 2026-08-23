CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "UserRole" AS ENUM ('CITIZEN', 'PROJECT_HEAD', 'ENGINEER', 'ADMIN');
CREATE TYPE "TicketState" AS ENUM ('DRAFT', 'AI_CHECK_PENDING', 'AI_FLAGGED', 'PENDING_VALIDATION', 'VALIDATED', 'ROUTED_TO_AGENCY', 'INSPECTION_DUE', 'INSPECTION_COMPLETE', 'PROJECT_CREATED', 'ENGINEER_ASSIGNED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED', 'PENDING_CITIZEN_VERIFICATION', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ProjectState" AS ENUM ('CREATED', 'ENGINEER_ASSIGNED', 'ACCEPTED', 'TIMELINE_SET', 'CONFLICT_CHECKED', 'WORK_IN_PROGRESS', 'WORK_COMPLETED', 'PENDING_CITIZEN_VERIFICATION', 'CLOSED', 'CANCELLED');
CREATE TYPE "DependencyState" AS ENUM ('REQUESTED', 'PENDING_RESPONSE', 'ASSIGNED', 'DECLINED_UNAVAILABLE', 'DECLINED_NOT_CONCERNED', 'ESCALATED', 'FULFILLED');
CREATE TYPE "ValidationVote" AS ENUM ('CONFIRM', 'REJECT');

CREATE TABLE "Ward" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "boundary" geometry(Polygon,4326) NOT NULL,
  "verificationRadiusOverrideMeters" INTEGER,
  CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Agency" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "passwordHash" TEXT,
  "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerifiedAt" TIMESTAMP(3),
  "totpSecret" TEXT,
  "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "agencyId" UUID,
  "wardId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "primaryAgencyId" UUID NOT NULL,
  "adminEditable" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutingRule" (
  "categoryId" UUID NOT NULL,
  "dependencyAgencyId" UUID NOT NULL,
  CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("categoryId", "dependencyAgencyId")
);

CREATE TABLE "Ticket" (
  "id" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "reporterId" UUID,
  "assignedAgencyId" UUID,
  "coordinates" geometry(Point,4326) NOT NULL,
  "wardId" UUID NOT NULL,
  "state" "TicketState" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Observation" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "submitterId" UUID NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Validation" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "validatorId" UUID NOT NULL,
  "vote" "ValidationVote" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" UUID NOT NULL,
  "ticketId" UUID,
  "agencyId" UUID NOT NULL,
  "state" "ProjectState" NOT NULL DEFAULT 'CREATED',
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "engineerId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dependency" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "requestingAgencyId" UUID NOT NULL,
  "respondingAgencyId" UUID NOT NULL,
  "assignedEngineerId" UUID,
  "state" "DependencyState" NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadSegment" (
  "id" UUID NOT NULL,
  "roadName" TEXT NOT NULL,
  "geometry" geometry(LineString,4326) NOT NULL,
  "wardId" UUID NOT NULL,
  "surfaceType" TEXT NOT NULL,
  "lastRestorationDate" TIMESTAMP(3),
  CONSTRAINT "RoadSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Intervention" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "requestingAgencyId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "plannedStart" TIMESTAMP(3) NOT NULL,
  "plannedEnd" TIMESTAMP(3) NOT NULL,
  "affectedLengthM" DOUBLE PRECISION NOT NULL,
  "dependencyRefs" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminConfig" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT NOT NULL,
  CONSTRAINT "AdminConfig_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "OtpChallenge" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ward_name_key" ON "Ward"("name");
CREATE UNIQUE INDEX "Agency_name_key" ON "Agency"("name");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Validation_ticketId_validatorId_key" ON "Validation"("ticketId", "validatorId");
CREATE UNIQUE INDEX "Project_ticketId_key" ON "Project"("ticketId");
CREATE UNIQUE INDEX "Intervention_projectId_key" ON "Intervention"("projectId");
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");
CREATE INDEX "User_wardId_idx" ON "User"("wardId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "Category_primaryAgencyId_idx" ON "Category"("primaryAgencyId");
CREATE INDEX "RoutingRule_categoryId_idx" ON "RoutingRule"("categoryId");
CREATE INDEX "RoutingRule_dependencyAgencyId_idx" ON "RoutingRule"("dependencyAgencyId");
CREATE INDEX "Ticket_categoryId_idx" ON "Ticket"("categoryId");
CREATE INDEX "Ticket_reporterId_idx" ON "Ticket"("reporterId");
CREATE INDEX "Ticket_assignedAgencyId_idx" ON "Ticket"("assignedAgencyId");
CREATE INDEX "Ticket_wardId_idx" ON "Ticket"("wardId");
CREATE INDEX "Ticket_state_idx" ON "Ticket"("state");
CREATE INDEX "Ticket_coordinates_gist_idx" ON "Ticket" USING GIST ("coordinates");
CREATE INDEX "Observation_ticketId_idx" ON "Observation"("ticketId");
CREATE INDEX "Observation_submitterId_idx" ON "Observation"("submitterId");
CREATE INDEX "Validation_ticketId_idx" ON "Validation"("ticketId");
CREATE INDEX "Validation_validatorId_idx" ON "Validation"("validatorId");
CREATE INDEX "Project_ticketId_idx" ON "Project"("ticketId");
CREATE INDEX "Project_agencyId_idx" ON "Project"("agencyId");
CREATE INDEX "Project_engineerId_idx" ON "Project"("engineerId");
CREATE INDEX "Project_state_idx" ON "Project"("state");
CREATE INDEX "Dependency_projectId_idx" ON "Dependency"("projectId");
CREATE INDEX "Dependency_requestingAgencyId_idx" ON "Dependency"("requestingAgencyId");
CREATE INDEX "Dependency_respondingAgencyId_idx" ON "Dependency"("respondingAgencyId");
CREATE INDEX "Dependency_assignedEngineerId_idx" ON "Dependency"("assignedEngineerId");
CREATE INDEX "Dependency_state_idx" ON "Dependency"("state");
CREATE INDEX "RoadSegment_wardId_idx" ON "RoadSegment"("wardId");
CREATE INDEX "RoadSegment_roadName_idx" ON "RoadSegment"("roadName");
CREATE INDEX "RoadSegment_geometry_gist_idx" ON "RoadSegment" USING GIST ("geometry");
CREATE INDEX "Intervention_projectId_idx" ON "Intervention"("projectId");
CREATE INDEX "Intervention_segmentId_idx" ON "Intervention"("segmentId");
CREATE INDEX "Intervention_requestingAgencyId_idx" ON "Intervention"("requestingAgencyId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "OtpChallenge_userId_createdAt_idx" ON "OtpChallenge"("userId", "createdAt");
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_primaryAgencyId_fkey" FOREIGN KEY ("primaryAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_dependencyAgencyId_fkey" FOREIGN KEY ("dependencyAgencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedAgencyId_fkey" FOREIGN KEY ("assignedAgencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_requestingAgencyId_fkey" FOREIGN KEY ("requestingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_respondingAgencyId_fkey" FOREIGN KEY ("respondingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_assignedEngineerId_fkey" FOREIGN KEY ("assignedEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoadSegment" ADD CONSTRAINT "RoadSegment_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RoadSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_requestingAgencyId_fkey" FOREIGN KEY ("requestingAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_identity_by_role_check" CHECK (
  ("role" = 'CITIZEN' AND "phone" IS NOT NULL AND "email" IS NULL AND "passwordHash" IS NULL)
  OR
  ("role" <> 'CITIZEN' AND "email" IS NOT NULL AND "passwordHash" IS NOT NULL)
);

ALTER TABLE "Project" ADD CONSTRAINT "Project_timeline_order_check" CHECK (
  "plannedStart" IS NULL OR "plannedEnd" IS NULL OR "plannedStart" <= "plannedEnd"
);

ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_timeline_order_check" CHECK ("plannedStart" <= "plannedEnd");
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_affected_length_check" CHECK ("affectedLengthM" > 0);
