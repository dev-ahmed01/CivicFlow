ALTER TABLE "ProjectEvidence" ADD COLUMN "uploadedAt" TIMESTAMP(3);
UPDATE "ProjectEvidence" SET "uploadedAt" = "createdAt" WHERE "objectKey" IS NOT NULL;
