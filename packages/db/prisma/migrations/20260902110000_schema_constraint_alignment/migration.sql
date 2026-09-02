-- Keep the physical database aligned with Prisma's client-side UUID/default
-- semantics and the renamed system-configuration model. Forward-only: do not
-- rewrite already-applied migrations used by existing SIH rehearsal databases.
ALTER TABLE "InspectionReport" DROP CONSTRAINT "InspectionReport_submittedById_fkey";
ALTER TABLE "InspectionReport" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ProjectBlocker" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "ProjectReassignmentRequest" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "SystemConfig" RENAME CONSTRAINT "AdminConfig_pkey" TO "SystemConfig_pkey";
ALTER TABLE "InspectionReport"
  ADD CONSTRAINT "InspectionReport_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
