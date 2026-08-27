INSERT INTO "WorkflowAction" ("id", "dedupeKey", "type", "ticketId", "responsibleUserId", "responsibleAgencyId", "deadline", "createdAt")
SELECT gen_random_uuid(), 'ticket:' || t."id" || ':create-project', 'CREATE_PROJECT'::"WorkflowActionType", t."id", u."id", t."assignedAgencyId",
  t."createdAt" + INTERVAL '3 days', t."createdAt"
FROM "Ticket" t
JOIN LATERAL (
  SELECT "id" FROM "User" WHERE "agencyId" = t."assignedAgencyId" AND "role" = 'PROJECT_HEAD'::"UserRole" ORDER BY "createdAt", "id" LIMIT 1
) u ON TRUE
WHERE t."state" = 'INSPECTION_COMPLETE'::"TicketState"
  AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."ticketId" = t."id")
ON CONFLICT ("dedupeKey") DO NOTHING;

INSERT INTO "WorkflowAction" ("id", "dedupeKey", "type", "ticketId", "projectId", "responsibleUserId", "responsibleAgencyId", "deadline", "createdAt")
SELECT gen_random_uuid(), 'ticket:' || p."ticketId" || ':assign-engineer', 'ASSIGN_ENGINEER'::"WorkflowActionType", p."ticketId", p."id", u."id", p."agencyId",
  p."createdAt" + INTERVAL '3 days', p."createdAt"
FROM "Project" p
JOIN LATERAL (
  SELECT "id" FROM "User" WHERE "agencyId" = p."agencyId" AND "role" = 'PROJECT_HEAD'::"UserRole" ORDER BY "createdAt", "id" LIMIT 1
) u ON TRUE
WHERE p."state" = 'CREATED'::"ProjectState" AND p."ticketId" IS NOT NULL
ON CONFLICT ("dedupeKey") DO NOTHING;
