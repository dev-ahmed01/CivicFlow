import assert from "node:assert/strict";
import request from "supertest";
import { ProjectState, TicketState, UserRole, prisma } from "db";
import { createApp } from "../src/app";
import type { ImageRelevanceService } from "../src/images/relevance";
import type { ImageStorage } from "../src/images/storage";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-that-is-at-least-32-characters";

const titlePrefix = "[Phase 15 multi-user]";
const password = "CivicOS@123";
const reporterId = "40000000-0000-4000-8000-000000000001";
const bescomAgencyId = "20000000-0000-4000-8000-000000000002";
const streetlightCategoryId = "30000000-0000-4000-8000-000000000002";
const bescomEngineerId = "40000000-0000-4000-8000-000000000203";

type Session = {
  userId: string;
  accessToken: string;
  refreshToken: string;
};

type NotificationRow = {
  id: string;
  type: string;
  payload: unknown;
  read: boolean;
};

const storage: ImageStorage = {
  createUpload(objectKey, contentType) {
    return {
      uploadUrl: `https://uploads.example.test/${objectKey}`,
      publicUrl: `https://images.example.test/${objectKey}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: 900,
    };
  },
  createDownload(objectKey) {
    return `https://images.example.test/${objectKey}`;
  },
  async verifyUpload() {
    return true;
  },
};

const relevance: ImageRelevanceService = {
  async checkImageRelevance() {
    return { pass: true, score: 0.99 };
  },
  async getImageEmbedding() {
    return null;
  },
};

function bearer(session: Session): string {
  return `Bearer ${session.accessToken}`;
}

function payloadHas(payload: unknown, key: string, value: string): boolean {
  return typeof payload === "object"
    && payload !== null
    && key in payload
    && (payload as Record<string, unknown>)[key] === value;
}

function hasNotification(notifications: NotificationRow[], type: string, key: string, value: string): boolean {
  return notifications.some((notification) => notification.type === type && payloadHas(notification.payload, key, value));
}

async function citizenLogin(app: ReturnType<typeof createApp>, userId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
  assert.ok(user.phone, `Citizen ${userId} must have a seeded phone number`);
  const response = await request(app).post("/auth/citizen/login").send({ userId: user.phone, password }).expect(200);
  assert.equal(response.body.user.id, userId);
  return { userId, accessToken: response.body.accessToken as string, refreshToken: response.body.refreshToken as string };
}

async function internalLogin(
  app: ReturnType<typeof createApp>,
  email: string,
  expectedRole: "PROJECT_HEAD" | "ENGINEER",
): Promise<Session> {
  const response = await request(app).post("/auth/internal/login").send({ email, password, expectedRole }).expect(200);
  assert.equal(response.body.user.role, expectedRole);
  return {
    userId: response.body.user.id as string,
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
  };
}

async function notificationsFor(app: ReturnType<typeof createApp>, session: Session): Promise<NotificationRow[]> {
  const response = await request(app).get("/notifications?limit=50").set("Authorization", bearer(session)).expect(200);
  return response.body.notifications as NotificationRow[];
}

async function cleanup(): Promise<void> {
  const tickets = await prisma.ticket.findMany({
    where: { title: { startsWith: titlePrefix } },
    select: { id: true, project: { select: { id: true } } },
  });
  const ticketIds = tickets.map(({ id }) => id);
  const projectIds = tickets.flatMap(({ project }) => project ? [project.id] : []);
  for (const projectId of projectIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  }
  for (const ticketId of ticketIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'ticketId' = ${ticketId}`;
  }
  if (projectIds.length > 0) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  if (ticketIds.length > 0) await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

async function main(): Promise<void> {
  await cleanup();
  const runStarted = new Date();
  const sessionUserIds = new Set<string>();
  const app = createApp({ otpProvider: { async sendOtp() {} }, imageRelevance: relevance, imageStorage: storage });

  try {
    const reporter = await citizenLogin(app, reporterId);
    sessionUserIds.add(reporter.userId);

    const created = await request(app)
      .post("/tickets")
      .set("Authorization", bearer(reporter))
      .send({
        categoryId: streetlightCategoryId,
        title: `${titlePrefix} streetlight restoration`,
        address: "11th Main Road, Jayanagar, Bengaluru",
        latitude: 12.9299,
        longitude: 77.5844,
        channel: "MOBILE",
        note: "The streetlight is dark and creates a safety risk after sunset.",
        primaryImage: { fileName: "dark-streetlight.jpg", contentType: "image/jpeg" },
      })
      .expect(201);
    const draftTicketId = created.body.ticketId as string;
    const submitted = await request(app)
      .post(`/tickets/${draftTicketId}/images`)
      .set("Authorization", bearer(reporter))
      .send({ action: "complete", imageId: created.body.imageId })
      .expect(200);
    const ticketId = submitted.body.ticket.id as string;
    assert.equal(ticketId, draftTicketId, "Phase 15 fixture must create a new authoritative ticket");
    assert.equal(submitted.body.ticket.status, "COMMUNITY_REVIEW");

    const persistedSubmission = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { observations: { include: { images: true } } },
    });
    assert.equal(persistedSubmission.reporterId, reporter.userId);
    assert.equal(persistedSubmission.state, TicketState.PENDING_VALIDATION);
    assert.equal(persistedSubmission.observations[0]?.images[0]?.uploadedAt instanceof Date, true);

    const reporterOngoing = await request(app)
      .get("/citizens/me/tickets?filter=ongoing&limit=50")
      .set("Authorization", bearer(reporter))
      .expect(200);
    assert.equal(reporterOngoing.body.tickets.some((ticket: { id: string }) => ticket.id === ticketId), true);

    const invitations = await prisma.validationRequest.findMany({
      where: { ticketId },
      orderBy: [{ distanceMeters: "asc" }, { citizenId: "asc" }],
      take: 3,
      select: { citizenId: true },
    });
    assert.equal(invitations.length, 3, "Three distinct validation recipients are required for quorum");

    const validators: Session[] = [];
    for (const invitation of invitations) {
      const validator = await citizenLogin(app, invitation.citizenId);
      validators.push(validator);
      sessionUserIds.add(validator.userId);
      const notifications = await notificationsFor(app, validator);
      assert.equal(hasNotification(notifications, "VALIDATION_REQUEST", "ticketId", ticketId), true);
      const pending = await request(app)
        .get("/citizens/me/pending-validations")
        .set("Authorization", bearer(validator))
        .expect(200);
      assert.equal(pending.body.validations.some((item: { ticketId: string }) => item.ticketId === ticketId), true);
    }
    const concurrentVotes = await Promise.all(validators.map((validator) => request(app)
        .post(`/tickets/${ticketId}/validate`)
        .set("Authorization", bearer(validator))
        .send({ vote: "CONFIRM" })
        .expect(200)));
    assert.equal(concurrentVotes.every((vote) => vote.body.counted === true), true);

    const routedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    assert.equal(routedTicket.state, TicketState.ROUTED_TO_AGENCY);
    assert.equal(routedTicket.assignedAgencyId, bescomAgencyId);
    const reporterAfterValidation = await request(app)
      .get(`/tickets/${ticketId}`)
      .set("Authorization", bearer(reporter))
      .expect(200);
    assert.equal(reporterAfterValidation.body.ticket.status, "ASSIGNED");
    const reporterRoutingNotifications = await notificationsFor(app, reporter);
    assert.equal(hasNotification(reporterRoutingNotifications, "TICKET_VALIDATED", "ticketId", ticketId), true);
    assert.equal(hasNotification(reporterRoutingNotifications, "TICKET_ROUTED_TO_AGENCY", "ticketId", ticketId), true);

    const projectHead = await internalLogin(app, "head.bescom@civicos.local", UserRole.PROJECT_HEAD);
    sessionUserIds.add(projectHead.userId);
    const headNotifications = await notificationsFor(app, projectHead);
    const routedNotification = headNotifications.find((notification) => notification.type === "TICKET_ROUTED_TO_AGENCY" && payloadHas(notification.payload, "ticketId", ticketId));
    assert.ok(routedNotification, "The assigned BESCOM Project Head must receive the routing notification");
    await request(app)
      .patch(`/notifications/${routedNotification.id}/read`)
      .set("Authorization", bearer(projectHead))
      .expect(200);
    assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: routedNotification.id } })).read, true);
    const agencyQueue = await request(app).get("/tickets?limit=50").set("Authorization", bearer(projectHead)).expect(200);
    assert.equal(agencyQueue.body.tickets.some((ticket: { id: string }) => ticket.id === ticketId), true);

    const inspection = await request(app)
      .post(`/tickets/${ticketId}/inspection-report`)
      .set("Authorization", bearer(projectHead))
      .send({
        action: "presign",
        fileName: "streetlight-inspection.pdf",
        contentType: "application/pdf",
        notes: "Inspection confirms a failed luminaire and feeder connection requiring replacement.",
      })
      .expect(201);
    await request(app)
      .post(`/tickets/${ticketId}/inspection-report`)
      .set("Authorization", bearer(projectHead))
      .send({ action: "complete", reportId: inspection.body.reportId })
      .expect(200);

    const projectCreated = await request(app)
      .post("/projects")
      .set("Authorization", bearer(projectHead))
      .send({ ticketId, engineerId: bescomEngineerId })
      .expect(201);
    const projectId = projectCreated.body.project.id as string;
    assert.equal(projectCreated.body.project.state, ProjectState.PENDING_UPTAKE);

    const engineer = await internalLogin(app, "engineer.bescom@civicos.local", UserRole.ENGINEER);
    sessionUserIds.add(engineer.userId);
    assert.equal(engineer.userId, bescomEngineerId);
    const engineerNotifications = await notificationsFor(app, engineer);
    assert.equal(hasNotification(engineerNotifications, "PROJECT_ASSIGNMENT", "projectId", projectId), true);
    const assignedProjects = await request(app)
      .get("/projects?scope=assigned&limit=50")
      .set("Authorization", bearer(engineer))
      .expect(200);
    assert.equal(assignedProjects.body.projects.some((project: { id: string }) => project.id === projectId), true);

    await request(app).post(`/projects/${projectId}/uptake`).set("Authorization", bearer(engineer)).expect(200);
    await request(app)
      .patch(`/projects/${projectId}/timeline`)
      .set("Authorization", bearer(engineer))
      .send({
        plannedStart: "2028-01-10T00:00:00.000Z",
        plannedEnd: "2028-01-15T23:59:59.999Z",
        workDescription: "Replace the failed luminaire, repair the feeder connection, and test illumination.",
        dependencyFlags: [],
      })
      .expect(200);
    assert.equal((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).state, TicketState.WORK_IN_PROGRESS);
    const reporterDuringWork = await request(app)
      .get(`/tickets/${ticketId}`)
      .set("Authorization", bearer(reporter))
      .expect(200);
    assert.equal(reporterDuringWork.body.ticket.status, "WORK_IN_PROGRESS");
    assert.equal(hasNotification(await notificationsFor(app, reporter), "WORK_STARTED", "projectId", projectId), true);

    await request(app)
      .patch(`/projects/${projectId}/status`)
      .set("Authorization", bearer(engineer))
      .send({ state: "COMPLETED", note: "The luminaire is operating and the site passed the night visibility check." })
      .expect(200);
    const evidence = await request(app)
      .post(`/projects/${projectId}/completion`)
      .set("Authorization", bearer(engineer))
      .send({
        action: "presign",
        fileName: "restored-streetlight.jpg",
        contentType: "image/jpeg",
        notes: "Completion photo shows the restored streetlight operating after testing.",
      })
      .expect(201);
    const handoff = await request(app)
      .post(`/projects/${projectId}/completion`)
      .set("Authorization", bearer(engineer))
      .send({ action: "complete", evidenceId: evidence.body.evidenceId })
      .expect(200);
    assert.equal(handoff.body.validatorsNotified, validators.length);

    for (const validator of validators) {
      const completionNotifications = await notificationsFor(app, validator);
      assert.equal(hasNotification(completionNotifications, "COMPLETION_VERIFICATION_REQUEST", "projectId", projectId), true);
      const pending = await request(app)
        .get("/citizens/me/pending-completion-verifications")
        .set("Authorization", bearer(validator))
        .expect(200);
      assert.equal(pending.body.completions.some((item: { evidenceId: string }) => item.evidenceId === evidence.body.evidenceId), true);
      await request(app)
        .post(`/completion-evidence/${evidence.body.evidenceId}/verify`)
        .set("Authorization", bearer(validator))
        .send({ decision: "VERIFIED" })
        .expect(200);
    }

    const closed = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { project: true, stateTransitions: { orderBy: { createdAt: "asc" } } },
    });
    assert.equal(closed.state, TicketState.CLOSED);
    assert.equal(closed.project?.state, ProjectState.CLOSED);
    const reporterPast = await request(app)
      .get("/citizens/me/tickets?filter=past&limit=50")
      .set("Authorization", bearer(reporter))
      .expect(200);
    const closedForReporter = reporterPast.body.tickets.find((ticket: { id: string }) => ticket.id === ticketId);
    assert.ok(closedForReporter);
    assert.equal(closedForReporter.status, "CLOSED");
    assert.equal(hasNotification(await notificationsFor(app, reporter), "TICKET_RESOLVED", "ticketId", ticketId), true);

    const projectTransitions = await prisma.projectStateTransition.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    assert.ok(closed.stateTransitions.length >= 10);
    assert.ok(projectTransitions.length >= 7);
    assert.equal(closed.stateTransitions.every((transition) => transition.actedById !== null && transition.createdAt instanceof Date), true);
    assert.equal(projectTransitions.every((transition) => transition.actedById !== null && transition.createdAt instanceof Date), true);
    const ticketActors = new Set(closed.stateTransitions.map(({ actedById }) => actedById));
    assert.equal(ticketActors.has(reporter.userId), true);
    assert.equal(ticketActors.has(projectHead.userId), true);
    assert.equal(ticketActors.has(engineer.userId), true);
    assert.equal(validators.some(({ userId }) => ticketActors.has(userId)), true);

    console.log(
      "Phase 15 acceptance verified: six real authenticated users, citizen submission, concurrent validator quorum, agency routing, Project Head inspection/assignment, engineer execution, citizen completion verification, persistent notifications, authoritative My Tickets updates, and actor-attributed state history.",
    );
  } finally {
    for (const userId of sessionUserIds) {
      await prisma.refreshSession.deleteMany({ where: { userId, createdAt: { gte: runStarted } } });
    }
    await cleanup();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
