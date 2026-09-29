CREATE TABLE "DemoUpload" (
  "objectKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DemoUpload_pkey" PRIMARY KEY ("objectKey")
);

CREATE INDEX "DemoUpload_createdAt_idx" ON "DemoUpload"("createdAt");
