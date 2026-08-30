-- Older deployments may contain a cancelled Project without the transition
-- row introduced by later workflow hardening. Preserve that state explicitly
-- so the Civic Work Registry can derive cancellation audit metadata.
INSERT INTO "ProjectStateTransition" (
    "id", "projectId", "fromState", "toState", "reason", "actedById", "createdAt"
)
SELECT gen_random_uuid(), project."id", NULL, 'CANCELLED'::"ProjectState",
       'LEGACY_CANCELLED_STATE_BACKFILL', NULL, project."updatedAt"
FROM "Project" AS project
WHERE project."state" = 'CANCELLED'::"ProjectState"
  AND NOT EXISTS (
      SELECT 1
      FROM "ProjectStateTransition" AS transition
      WHERE transition."projectId" = project."id"
        AND transition."toState" = 'CANCELLED'::"ProjectState"
  );
