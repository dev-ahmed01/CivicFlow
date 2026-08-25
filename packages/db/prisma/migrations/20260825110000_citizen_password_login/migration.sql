-- Citizen password login supplements (but does not remove) the existing OTP flow.
-- Citizens still require a verified phone identity; email and passwordHash are optional
-- at the database level so existing OTP-only accounts remain valid.
ALTER TABLE "User" DROP CONSTRAINT "User_identity_by_role_check";

ALTER TABLE "User" ADD CONSTRAINT "User_identity_by_role_check" CHECK (
  ("role" = 'CITIZEN' AND "phone" IS NOT NULL)
  OR
  ("role" <> 'CITIZEN' AND "email" IS NOT NULL AND "passwordHash" IS NOT NULL)
);
