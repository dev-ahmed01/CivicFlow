-- Demo-readiness: match the filters and reverse-chronological sorts used by
-- ticket, project, and notification pagination.
CREATE INDEX "Ticket_assignedAgencyId_createdAt_idx" ON "Ticket"("assignedAgencyId", "createdAt");
CREATE INDEX "Project_agencyId_createdAt_idx" ON "Project"("agencyId", "createdAt");
CREATE INDEX "Project_engineerId_state_createdAt_idx" ON "Project"("engineerId", "state", "createdAt");
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");
