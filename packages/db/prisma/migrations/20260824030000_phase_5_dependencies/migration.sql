ALTER TABLE "Dependency"
  ADD COLUMN "requirement" TEXT,
  ADD COLUMN "deadline" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedAt" TIMESTAMP(3);

UPDATE "Dependency"
SET "requirement" = 'Coordination required',
    "deadline" = "createdAt" + INTERVAL '48 hours';

ALTER TABLE "Dependency"
  ALTER COLUMN "requirement" SET NOT NULL,
  ALTER COLUMN "deadline" SET NOT NULL;

CREATE UNIQUE INDEX "Dependency_projectId_respondingAgencyId_key"
  ON "Dependency"("projectId", "respondingAgencyId");
CREATE INDEX "Dependency_state_deadline_idx" ON "Dependency"("state", "deadline");

CREATE TABLE "DependencyStateTransition" (
  "id" UUID NOT NULL,
  "dependencyId" UUID NOT NULL,
  "fromState" "DependencyState",
  "toState" "DependencyState" NOT NULL,
  "reason" TEXT NOT NULL,
  "actedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DependencyStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DependencyStateTransition_dependencyId_createdAt_idx"
  ON "DependencyStateTransition"("dependencyId", "createdAt");
CREATE INDEX "DependencyStateTransition_actedById_idx"
  ON "DependencyStateTransition"("actedById");

ALTER TABLE "DependencyStateTransition" ADD CONSTRAINT "DependencyStateTransition_dependencyId_fkey"
  FOREIGN KEY ("dependencyId") REFERENCES "Dependency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DependencyStateTransition" ADD CONSTRAINT "DependencyStateTransition_actedById_fkey"
  FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
