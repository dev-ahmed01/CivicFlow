-- Keep the idempotency constraint name below PostgreSQL's 63-byte identifier limit.
ALTER INDEX "ConflictLog_projectId_conflictingProjectId_timelineFingerprint_"
  RENAME TO "ConflictLog_pair_timeline_key";
