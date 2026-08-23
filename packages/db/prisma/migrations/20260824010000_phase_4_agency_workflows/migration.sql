CREATE TABLE "InspectionReport" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "submittedById" UUID NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionReport_objectKey_key" ON "InspectionReport"("objectKey");
CREATE INDEX "InspectionReport_ticketId_createdAt_idx" ON "InspectionReport"("ticketId", "createdAt");
CREATE INDEX "InspectionReport_submittedById_idx" ON "InspectionReport"("submittedById");

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
