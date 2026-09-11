import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { ACTIVE_PROJECT_STATES, COMPLETED_ENGINEER_WORK_STATES, OPEN_INSPECTION_STATES, OPEN_DEPENDENCY_STATES, engineerWorkload, projectPipelineStage } from "@civicos/shared";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; verification never selects a default database.");
const client = new PrismaClient();
const primaryAgency = "20000000-0000-4000-8000-000000000003";
const identifier = (value: string) => { assert.match(value, /^[A-Za-z][A-Za-z0-9_]*$/); return Prisma.raw(`"${value}"`); };

async function verify() {
  return client.$transaction(async (db) => {
    await db.$executeRaw`SET TRANSACTION READ ONLY`;
    const now = Date.now();
    const agencies = await db.agency.findMany({ orderBy: { id: "asc" } });
    assert.equal(agencies.length, 7, "Exactly seven demo agencies");
    const seededAt = await db.systemConfig.findUniqueOrThrow({ where: { key: "demo.seeded_at" } });
    const age = now - new Date(String(seededAt.value)).getTime();
    assert(age >= 0 && age < 3 * 86400000, "Demo must be reset within the last three days; do not silently age fixtures");
    // Verify every declared FK, including relation tables omitted from older reset scripts.
    for (const model of Prisma.dmmf.datamodel.models) for (const relation of model.fields.filter((f) => f.relationFromFields?.length)) {
      const target = Prisma.dmmf.datamodel.models.find((m) => m.name === relation.type)!;
      const sourceFields = relation.relationFromFields!;
      const destinationFields = relation.relationToFields!;
      const join = Prisma.join(sourceFields.map((f, i) => Prisma.sql`s.${identifier(f)} = t.${identifier(destinationFields[i]!)}`), " AND ");
      const nonnull = Prisma.join(sourceFields.map((f) => Prisma.sql`s.${identifier(f)} IS NOT NULL`), " AND ");
      const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM ${identifier(model.dbName ?? model.name)} s LEFT JOIN ${identifier(target.dbName ?? target.name)} t ON ${join} WHERE ${nonnull} AND t.${identifier(destinationFields[0]!)} IS NULL`);
      assert.equal(rows[0]!.count, 0, `No orphan ${model.name}.${relation.name}`);
    }
    const projects = await db.project.findMany({ include: { engineer: true, stateTransitions: { orderBy: { createdAt: "asc" } }, completionEvidence: true } });
    for (const project of projects) {
      if (project.engineerId) { assert.equal(project.engineer?.role, "ENGINEER"); assert.equal(project.engineer.agencyId, project.agencyId, "Engineer agency must own work"); }
      assert.equal(project.stateTransitions.at(-1)?.toState, project.state, "History ends at persisted work state");
      if (project.actualStart) assert(project.actualStart.getTime() <= now, "No future actual start");
      if (COMPLETED_ENGINEER_WORK_STATES.includes(project.state)) assert(project.actualCompletion && project.actualStart && project.actualCompletion >= project.actualStart, "Completed works have actual dates");
    }
    const engineers = await db.user.findMany({ where: { agencyId: primaryAgency, role: "ENGINEER" }, orderBy: { id: "asc" }, include: { engineeringProjects: true, assignedInspections: { where: { status: { in: OPEN_INSPECTION_STATES } } }, responsibleActions: { where: { respondedAt: null } } } });
    assert.equal(engineers.length, 3);
    const engineerRows = [];
    for (const [index, engineer] of engineers.entries()) {
      assert.equal(engineer.displayName, `Engineer ${index + 1}`);
      assert(engineer.engineeringProjects.length > 0);
      const workload = engineerWorkload(engineer.engineeringProjects, engineer.assignedInspections, engineer.responsibleActions, now);
      assert.equal(workload.activeWorks, await db.project.count({ where: { agencyId: primaryAgency, engineerId: engineer.id, state: { in: ACTIVE_PROJECT_STATES } } }));
      const completed = engineer.engineeringProjects.filter((p) => COMPLETED_ENGINEER_WORK_STATES.includes(p.state)).length;
      assert.equal(completed, await db.project.count({ where: { engineerId: engineer.id, state: { in: COMPLETED_ENGINEER_WORK_STATES } } }));
      engineerRows.push({ name: engineer.displayName, email: engineer.email, ...workload, completed });
    }
    assert.equal(new Set(engineerRows.map((e) => e.loadLabel)).size, 3, "Persisted workloads demonstrate all three load bands");
    const dependencies = await db.dependency.findMany({ include: { project: true, assignedEngineer: true, stateTransitions: true } });
    for (const d of dependencies) {
      assert.equal(d.requestingAgencyId, d.project.agencyId);
      if (d.assignedEngineer) assert.equal(d.assignedEngineer.agencyId, d.respondingAgencyId);
      assert(d.stateTransitions.some((t) => t.toState === d.state));
    }
    const overdue = dependencies.filter((d) => OPEN_DEPENDENCY_STATES.includes(d.state) && d.deadline.getTime() < now);
    assert.equal(overdue.length, 1, "Only one intentional overdue dependency");
    assert.equal(overdue[0]!.id, "a4000000-0000-4000-8000-000000000003");
    assert.equal(await db.project.count({ where: { plannedEnd: { lt: new Date() }, state: { notIn: ["COMPLETED", "AWAITING_VERIFICATION", "CLOSED", "CANCELLED"] } } }), 0, "No unintended overdue work");
    const notifications = await db.notification.findMany();
    const notificationRows = [];
    for (const user of await db.user.findMany()) {
      const unread = notifications.filter((n) => n.userId === user.id && !n.read).length;
      assert.equal(unread, await db.notification.count({ where: { userId: user.id, read: false } }));
      if (notifications.some((n) => n.userId === user.id)) notificationRows.push({ account: user.email ?? user.phone, unread, read: notifications.filter((n) => n.userId === user.id && n.read).length });
    }
    const mapped = await db.$queryRaw<{ id: string; state: string; openDependencies: number }[]>`SELECT p."id", p."state", (SELECT count(*)::int FROM "Dependency" d WHERE d."projectId"=p."id" AND d."state" IN ('REQUESTED','PENDING_RESPONSE','ASSIGNED','ESCALATED','DECLINED_UNAVAILABLE')) AS "openDependencies" FROM "Project" p WHERE p."geometry" IS NOT NULL AND NOT ST_IsEmpty(p."geometry") AND ST_IsValid(p."geometry") AND p."plannedStart" IS NOT NULL AND p."plannedEnd" IS NOT NULL`;
    assert.equal(new Set(mapped.map((p) => p.id)).size, mapped.length);
    const mapActive = mapped.filter((p) => ACTIVE_PROJECT_STATES.includes(p.state as "ACTIVE")).length;
    const mapActiveQuery = await db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM "Project" WHERE "state"::text IN (${Prisma.join(ACTIVE_PROJECT_STATES)}) AND "geometry" IS NOT NULL AND NOT ST_IsEmpty("geometry") AND ST_IsValid("geometry") AND "plannedStart" IS NOT NULL AND "plannedEnd" IS NOT NULL`);
    assert.equal(mapActiveQuery[0]!.count, mapActive);
    const lifecycle = projects.reduce<Record<string, number>>((counts, p) => { const stage = projectPipelineStage(p.state); counts[stage] = (counts[stage] ?? 0) + 1; return counts; }, {});
    const inspections = await db.inspectionReport.groupBy({ by: ["status"], _count: true });
    const coordination = await db.coordinationRequest.groupBy({ by: ["status"], _count: true });
    const dependencyStates = await db.dependency.groupBy({ by: ["state"], _count: true });
    const closed = await db.project.findUniqueOrThrow({ where: { id: "90000000-0000-4000-8000-000000000005" }, include: { ticket: { include: { validations: true, inspectionReports: true, observations: true } }, completionEvidence: { include: { verifications: true } } } });
    assert(closed.ticket?.validations.length && closed.ticket.inspectionReports.length && closed.ticket.observations.length && closed.completionEvidence.some((e) => e.verifications.some((v) => v.decision === "VERIFIED")), "Citizen report closes through validation, inspection and verified completion");
    const resolvedWhere = { coordinationRequests: { some: { status: { in: ["COMPLETED", "CLOSED"] as ("COMPLETED" | "CLOSED")[] } } } };
    const resolvedConflicts = await db.conflictLog.count({ where: resolvedWhere }) + await db.roadConflictLog.count({ where: resolvedWhere });
    const totalConflicts = await db.conflictLog.count() + await db.roadConflictLog.count();
    assert(resolvedConflicts > 0 && totalConflicts > resolvedConflicts);
    return { verifiedAt: new Date(now).toISOString(), seededAt: seededAt.value, agencies, engineers: engineerRows, lifecycle, intake: await db.ticket.count({ where: { state: "ROUTED_TO_AGENCY" } }), inspections, dependencies: dependencyStates, overdueDependencies: overdue.length, coordination, conflicts: { needsReview: totalConflicts - resolvedConflicts, resolved: resolvedConflicts }, notifications: notificationRows, map: { totalLocations: mapped.length, active: mapActive, dependencyLocations: mapped.filter((p) => p.openDependencies > 0).length } };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}

verify().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => client.$disconnect());
