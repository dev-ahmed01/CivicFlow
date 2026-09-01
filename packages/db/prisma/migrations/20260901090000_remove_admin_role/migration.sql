-- Phase 1 role redesign: preserve historical actor rows without leaving an
-- authenticated, globally privileged persona in the operational product.
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" DROP CONSTRAINT "User_identity_by_role_check";

UPDATE "RefreshSession"
SET "revokedAt" = NOW()
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'ADMIN');

UPDATE "User"
SET
  "role" = 'PROJECT_HEAD',
  "email" = NULL,
  "passwordHash" = NULL,
  "mustResetPassword" = TRUE,
  "agencyId" = NULL,
  "totpSecret" = NULL,
  "totpEnabled" = FALSE,
  "deactivatedAt" = NOW()
WHERE "role" = 'ADMIN';

CREATE TYPE "UserRole_without_admin" AS ENUM ('CITIZEN', 'PROJECT_HEAD', 'ENGINEER');
DROP INDEX "User_role_idx";
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_without_admin"
  USING ("role"::text::"UserRole_without_admin");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_without_admin" RENAME TO "UserRole";
CREATE INDEX "User_role_idx" ON "User"("role");

ALTER TABLE "User" ADD CONSTRAINT "User_identity_by_role_check" CHECK (
  "deactivatedAt" IS NOT NULL
  OR ("role" = 'CITIZEN' AND "phone" IS NOT NULL)
  OR ("role" <> 'CITIZEN' AND "email" IS NOT NULL AND "passwordHash" IS NOT NULL)
);

ALTER TABLE "AdminConfig" RENAME TO "SystemConfig";
ALTER TABLE "Category" RENAME COLUMN "adminEditable" TO "isConfigurable";
