-- CreateEnum
CREATE TYPE "RoadScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "PotholeCandidateStatus" AS ENUM ('NEW', 'INSPECTION_ASSIGNED', 'LINKED', 'DISMISSED');

-- CreateTable
CREATE TABLE "RoadCamera" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wardId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "roadSegmentId" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "providerReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadCamera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadScan" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "RoadScanStatus" NOT NULL DEFAULT 'QUEUED',
    "initiatedById" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "wardId" UUID NOT NULL,
    "providerMode" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL,
    "camerasRequested" INTEGER NOT NULL DEFAULT 0,
    "camerasProcessed" INTEGER NOT NULL DEFAULT 0,
    "usableCameras" INTEGER NOT NULL DEFAULT 0,
    "unusableCameras" INTEGER NOT NULL DEFAULT 0,
    "rawDetections" INTEGER NOT NULL DEFAULT 0,
    "uniqueCandidates" INTEGER NOT NULL DEFAULT 0,
    "failureSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RoadScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadScanCameraResult" (
    "id" UUID NOT NULL,
    "scanId" UUID NOT NULL,
    "cameraId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "framesProcessed" INTEGER NOT NULL DEFAULT 0,
    "rawDetections" INTEGER NOT NULL DEFAULT 0,
    "failure" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "RoadScanCameraResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotholeCandidate" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "scanId" UUID NOT NULL,
    "cameraId" UUID NOT NULL,
    "status" "PotholeCandidateStatus" NOT NULL DEFAULT 'NEW',
    "detection" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "uniqueFrameCount" INTEGER NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "ticketId" UUID,
    "inspectionId" UUID,
    "projectId" UUID,
    "dismissReason" TEXT,
    "audit" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "PotholeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotholeObservation" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "scanId" UUID NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "detection" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "PotholeObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotholeVerificationScan" (
    "id" UUID NOT NULL,
    "scanId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "completionEvidenceId" UUID NOT NULL,
    "result" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB,

    CONSTRAINT "PotholeVerificationScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadCamera_code_key" ON "RoadCamera"("code");

-- CreateIndex
CREATE INDEX "RoadCamera_agencyId_wardId_enabled_idx" ON "RoadCamera"("agencyId", "wardId", "enabled");

-- CreateIndex
CREATE INDEX "RoadScan_agencyId_wardId_createdAt_idx" ON "RoadScan"("agencyId", "wardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoadScanCameraResult_scanId_cameraId_key" ON "RoadScanCameraResult"("scanId", "cameraId");

-- CreateIndex
CREATE UNIQUE INDEX "PotholeCandidate_reference_key" ON "PotholeCandidate"("reference");

-- CreateIndex
CREATE INDEX "PotholeCandidate_cameraId_status_idx" ON "PotholeCandidate"("cameraId", "status");

-- CreateIndex
CREATE INDEX "PotholeCandidate_ticketId_idx" ON "PotholeCandidate"("ticketId");

-- CreateIndex
CREATE INDEX "PotholeCandidate_projectId_idx" ON "PotholeCandidate"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PotholeObservation_candidateId_scanId_frameIndex_key" ON "PotholeObservation"("candidateId", "scanId", "frameIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PotholeVerificationScan_scanId_key" ON "PotholeVerificationScan"("scanId");

-- CreateIndex
CREATE INDEX "PotholeVerificationScan_projectId_idx" ON "PotholeVerificationScan"("projectId");

-- AddForeignKey
ALTER TABLE "RoadCamera" ADD CONSTRAINT "RoadCamera_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadCamera" ADD CONSTRAINT "RoadCamera_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadCamera" ADD CONSTRAINT "RoadCamera_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadCamera" ADD CONSTRAINT "RoadCamera_roadSegmentId_fkey" FOREIGN KEY ("roadSegmentId") REFERENCES "RoadSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadScan" ADD CONSTRAINT "RoadScan_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadScan" ADD CONSTRAINT "RoadScan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadScan" ADD CONSTRAINT "RoadScan_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadScanCameraResult" ADD CONSTRAINT "RoadScanCameraResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RoadScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadScanCameraResult" ADD CONSTRAINT "RoadScanCameraResult_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "RoadCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeCandidate" ADD CONSTRAINT "PotholeCandidate_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RoadScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeCandidate" ADD CONSTRAINT "PotholeCandidate_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "RoadCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeCandidate" ADD CONSTRAINT "PotholeCandidate_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeCandidate" ADD CONSTRAINT "PotholeCandidate_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeCandidate" ADD CONSTRAINT "PotholeCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeObservation" ADD CONSTRAINT "PotholeObservation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PotholeCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeObservation" ADD CONSTRAINT "PotholeObservation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RoadScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeVerificationScan" ADD CONSTRAINT "PotholeVerificationScan_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "RoadScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeVerificationScan" ADD CONSTRAINT "PotholeVerificationScan_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PotholeCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotholeVerificationScan" ADD CONSTRAINT "PotholeVerificationScan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
