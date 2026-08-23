ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER INDEX "CompletionVerificationRequest_completionEvidenceId_citizenId_ke"
  RENAME TO "CompletionVerificationRequest_completionEvidenceId_citizenI_key";
