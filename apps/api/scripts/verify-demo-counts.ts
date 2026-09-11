import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";
import { prisma } from "db";
import { ACTIVE_PROJECT_STATES, ENGINEER_STAGE_STATES, OPEN_INSPECTION_STATES, engineerWorkload, eligibleMappedWorks, mappedWorkCategories, type CivicWorkCalendarItem } from "@civicos/shared";
import { createApp } from "../src/app";
import { getEnv } from "../src/config/env";

// Read-only endpoint checks; no login/token-session writes and no workflow actions.
if (!process.env.DATABASE_URL) throw new Error("Explicit DATABASE_URL required");
const app = createApp();
async function main() {
  const head = await prisma.user.findUniqueOrThrow({ where: { email: "head.pwd@civicos.local" } });
  const token = (user: typeof head) => jwt.sign({ role: user.role, agencyId: user.agencyId, wardId: user.wardId, mustResetPassword: false, tokenType: "access" }, getEnv().JWT_ACCESS_SECRET, { subject: user.id, expiresIn: "5m", issuer: "civicos-api", audience: "civicos-clients" });
  const get = async (path: string, user = head) => (await request(app).get(path).set("Authorization", `Bearer ${token(user)}`).expect(200)).body;
  const dashboard = await get("/project-head/dashboard");
  assert.equal(dashboard.counts.activeProjects, await prisma.project.count({ where: { agencyId: head.agencyId!, state: { in: ACTIVE_PROJECT_STATES } } }));
  assert.equal(dashboard.counts.inspectionsAwaitingAssignment, await prisma.ticket.count({ where: { assignedAgencyId: head.agencyId, state: "ROUTED_TO_AGENCY" } }));
  const team = await get("/project-head/engineers");
  for (const row of team.engineers) {
    const engineer = await prisma.user.findUniqueOrThrow({ where: { id: row.id }, include: { engineeringProjects: true, assignedInspections: { where: { status: { in: OPEN_INSPECTION_STATES } } }, responsibleActions: { where: { respondedAt: null } } } });
    const expected = engineerWorkload(engineer.engineeringProjects, engineer.assignedInspections, engineer.responsibleActions);
    assert.deepEqual(row, { id: engineer.id, email: engineer.email, displayName: engineer.displayName, ...expected, nextDeadline: expected.nextDeadline?.toISOString() ?? null });
    for (const [stage, states] of Object.entries(ENGINEER_STAGE_STATES)) {
      const first = await get(`/projects?scope=mine&stage=${stage}&limit=1`, engineer);
      const ids: string[] = [];
      for (let page = 1; page <= first.pagination.totalPages; page++) {
        const result = page === 1 ? first : await get(`/projects?scope=mine&stage=${stage}&limit=1&page=${page}`, engineer);
        ids.push(...result.projects.map((p: { id: string }) => p.id));
      }
      const actual = await prisma.project.findMany({ where: { agencyId: engineer.agencyId!, engineerId: engineer.id, state: { in: states } } });
      assert.equal(first.pagination.total, actual.length);
      assert.deepEqual(ids.sort(), actual.map((p) => p.id).sort());
      if (stage === "active") assert.equal(ids.length, row.activeWorks);
    }
    const notifications = await get("/notifications?unread=true", engineer);
    assert.equal(notifications.unreadCount, await prisma.notification.count({ where: { userId: engineer.id, read: false } }));
    for (const direction of ["sent", "received"]) {
      const response = await get(`/dependencies?direction=${direction}`, engineer);
      const expectedDependencies = await prisma.dependency.findMany({ where: direction === "sent" ? { requestingAgencyId: engineer.agencyId! } : { respondingAgencyId: engineer.agencyId! } });
      assert.deepEqual(response.dependencies.map((d: { id: string }) => d.id).sort(), expectedDependencies.map((d) => d.id).sort());
    }
  }
  const now = Date.now();
  const query = new URLSearchParams({ dateFrom: new Date(now - 90 * 86400000).toISOString(), dateTo: new Date(now + 90 * 86400000).toISOString(), limit: "2" });
  const first = await get(`/civic-works/calendar?${query}`);
  const works: CivicWorkCalendarItem[] = [...first.works];
  for (let page = 2; page <= first.pagination.totalPages; page++) works.push(...(await get(`/civic-works/calendar?${query}&page=${page}`)).works);
  assert.equal(works.length, first.pagination.total);
  assert.equal(eligibleMappedWorks(works).length, works.length);
  const map = Object.fromEntries(Object.entries(mappedWorkCategories).map(([key, filter]) => [key, works.filter(filter).length]));
  console.log(JSON.stringify({ passed: true, agency: dashboard.agency, dashboard: dashboard.counts, engineers: team.engineers, map, mappedLocations: works.length, checks: "Scoped dashboard, team, paginated work stages, sent/received dependency sets, unread notifications, renderable map categories" }, null, 2));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
