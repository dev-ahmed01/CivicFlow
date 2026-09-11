import {
  CivicWorkOrigin,
  CompletionVerificationDecision,
  DependencyState,
  InspectionComplexity,
  InspectionIssueConfirmation,
  InspectionRecommendation,
  InspectionSeverity,
  InspectionStatus,
  Prisma,
  PrismaClient,
  ProjectState,
  RoadConflictSeverity,
  RoadConflictType,
  TicketState,
  UserRole,
  ValidationVote,
  WorkflowActionType,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { DEMO_WARD_SRID, demoWardBoundaryWkt, demoWardIds, demoWards } from "./src/demo-wards";

import { assertDemoResetAllowed, clearDemoDatabase } from "./src/demo-reset";
const client = new PrismaClient();
let prisma: Prisma.TransactionClient = client;
const seedNow = new Date();
const daysFromNow = (n: number) => new Date(seedNow.getTime() + n * 86_400_000);
const daysAgo = (n: number) => daysFromNow(-n);
const hoursAgo = (n: number) => new Date(seedNow.getTime() - n * 3_600_000);
const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";
const demoSeedMode = process.argv.includes("--reset") ? "reset" : process.env.DEMO_SEED_MODE ?? "if_empty";

if (demoSeedMode !== "reset" && demoSeedMode !== "if_empty" && demoSeedMode !== "team_only") {
  throw new Error("DEMO_SEED_MODE must be reset, if_empty, or team_only");
}

if (process.env.NODE_ENV === "production" && demoInternalPassword === "CivicOS@123") {
  throw new Error("DEMO_INTERNAL_PASSWORD must replace the local demo password in production");
}

const ids = {
  wards: {
    ...demoWardIds,
  },
  agencies: {
    bwssb: "20000000-0000-4000-8000-000000000001",
    bescom: "20000000-0000-4000-8000-000000000002",
    pwd: "20000000-0000-4000-8000-000000000003",
    waste: "20000000-0000-4000-8000-000000000004",
    traffic: "20000000-0000-4000-8000-000000000005",
    drainage: "20000000-0000-4000-8000-000000000006",
    telecom: "20000000-0000-4000-8000-000000000007",
  },
  roadSegments: {
    flagship: "80000000-0000-4000-8000-000000000001",
    btmCoordination: "80000000-0000-4000-8000-000000000002",
  },
  phase4Coordination: {
    resurfacingProject: "8b000000-0000-4000-8000-000000000001",
    pipelineProject: "8b000000-0000-4000-8000-000000000002",
    resurfacingIntervention: "8c000000-0000-4000-8000-000000000001",
    pipelineIntervention: "8c000000-0000-4000-8000-000000000002",
    conflict: "8d000000-0000-4000-8000-000000000001",
    resurfacingTransition: "8e000000-0000-4000-8000-000000000001",
    pipelineTransition: "8e000000-0000-4000-8000-000000000002",
    resurfacingAudit: "8f000000-0000-4000-8000-000000000001",
    pipelineAudit: "8f000000-0000-4000-8000-000000000002",
  },
  generalDemo: {
    ticket: "90000000-0000-4000-8000-000000000001",
    observation: "90000000-0000-4000-8000-000000000002",
    image: "90000000-0000-4000-8000-000000000003",
    inspection: "90000000-0000-4000-8000-000000000004",
    project: "90000000-0000-4000-8000-000000000005",
    dependency: "90000000-0000-4000-8000-000000000006",
    workNote: "90000000-0000-4000-8000-000000000007",
    completionEvidence: "90000000-0000-4000-8000-000000000008",
  },
  plannedWorks: {
    btmPipeline: "88000000-0000-4000-8000-000000000001",
    btmCable: "88000000-0000-4000-8000-000000000002",
    btmDrainage: "88000000-0000-4000-8000-000000000003",
  },
} as const;

const agencies = [
  { id: ids.agencies.bwssb, name: "BWSSB", type: "Water Board" },
  { id: ids.agencies.bescom, name: "BESCOM", type: "Electrical/Power" },
  { id: ids.agencies.pwd, name: "BBMP Road Infrastructure", type: "Roads/BBMP" },
  { id: ids.agencies.waste, name: "Municipal Waste Management", type: "Solid Waste" },
  { id: ids.agencies.traffic, name: "Bengaluru Traffic Police", type: "Traffic" },
  { id: ids.agencies.drainage, name: "BBMP Storm Water Drains", type: "Drainage" },
  { id: ids.agencies.telecom, name: "Telecom Utility Coordination", type: "Telecom" },
] as const;

const categories = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Road Damage", relevancePrompt: "a pothole, damaged road, cracked pavement, or broken asphalt", primaryAgencyId: ids.agencies.pwd },
  { id: "30000000-0000-4000-8000-000000000002", name: "Streetlight", relevancePrompt: "a damaged, broken, leaning, or non-working street light", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000003", name: "Water Supply", relevancePrompt: "water leakage, a broken water pipe, flooding, or standing water", primaryAgencyId: ids.agencies.bwssb },
  { id: "30000000-0000-4000-8000-000000000004", name: "Drainage/Sewage", relevancePrompt: "an overflowing drain, blocked storm drain, open sewer, or sewage spill", primaryAgencyId: ids.agencies.drainage },
  { id: "30000000-0000-4000-8000-000000000005", name: "Garbage/Waste", relevancePrompt: "dumped garbage, litter, an overflowing trash bin, or solid waste", primaryAgencyId: ids.agencies.waste },
  { id: "30000000-0000-4000-8000-000000000006", name: "Electrical Hazard", relevancePrompt: "exposed electrical wires, a fallen power line, sparking equipment, or an electrical hazard", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000007", name: "Public Toilet", relevancePrompt: "a damaged, dirty, blocked, or unusable public toilet", primaryAgencyId: ids.agencies.waste },
  { id: "30000000-0000-4000-8000-000000000008", name: "Parks & Trees", relevancePrompt: "a fallen or hazardous tree, damaged park equipment, or neglected public park", primaryAgencyId: ids.agencies.pwd },
  { id: "30000000-0000-4000-8000-000000000009", name: "Stray Animals", relevancePrompt: "stray dogs, cattle, or other unattended animals in a public place", primaryAgencyId: ids.agencies.waste },
  { id: "30000000-0000-4000-8000-000000000010", name: "Illegal Construction", relevancePrompt: "unauthorized construction, building work obstructing a public area, or construction debris", primaryAgencyId: ids.agencies.pwd },
  { id: "30000000-0000-4000-8000-000000000011", name: "Traffic & Signage", relevancePrompt: "a damaged traffic sign, broken signal, missing road sign, or traffic obstruction", primaryAgencyId: ids.agencies.traffic },
  { id: "30000000-0000-4000-8000-000000000012", name: "Other", relevancePrompt: "a visible civic infrastructure problem in a public place", primaryAgencyId: ids.agencies.waste },
] as const;

const routingRules = [
  [categories[0].id, ids.agencies.bwssb],
  [categories[0].id, ids.agencies.bescom],
  [categories[0].id, ids.agencies.traffic],
  [categories[1].id, ids.agencies.pwd],
  [categories[2].id, ids.agencies.pwd],
  [categories[3].id, ids.agencies.pwd],
  [categories[5].id, ids.agencies.pwd],
  [categories[9].id, ids.agencies.pwd],
  [categories[10].id, ids.agencies.pwd],
] as const;

const systemConfigs = [
  { key: "auth.otp_max_attempts", value: 5, description: "Maximum failed verification attempts for one OTP challenge" },
  // Delta §6 — inputs for the explicitly simulated restoration-savings formula.
  { key: "road.simulated_restoration_cost_per_meter", value: 1800, description: "Illustrative road restoration cost per affected metre in INR; never presented as measured" },
  { key: "road.simulated_avoided_rework_factor", value: 0.65, description: "Illustrative fraction of restoration work assumed avoided after an accepted sequencing recommendation" },
  { key: "verification.default_radius_meters", value: 500, description: "Default citizen verification radius when a ward override is absent" },
  { key: "verification.daily_cap", value: 10, description: "Maximum validations a citizen may submit per day" },
  { key: "verification.quorum", value: 1, description: "Independent confirmations required to validate a ticket" },
  { key: "verification.initial_recipient_count", value: 15, description: "Nearest eligible citizens notified for a validation batch" },
  { key: "verification.renotify_after_hours", value: 72, description: "Hours before an incomplete validation batch is sent again" },
  { key: "duplicate.radius_meters", value: 75, description: "Geographic radius used by shared-ticket detection" },
  { key: "duplicate.open_window_days", value: 60, description: "Age window used by shared-ticket detection" },
  { key: "duplicate.visual_similarity_threshold", value: 0.75, description: "Advisory CLIP embedding similarity threshold" },
  { key: "ai_relevance.max_retries", value: 3, description: "Maximum relevance-check retries before manual-review recommendation" },
  { key: "ai_relevance.pass_threshold", value: 0.6, description: "Minimum hosted image/category relevance confidence" },
  { key: "demo.web_auto_route_enabled", value: false, description: "Demo-only optional direct routing; disabled for the complete community-validation demo" },
  { key: "conflict.radius_meters", value: 200, description: "Default generic project conflict radius" },
  { key: "road.category_id", value: categories[0].id, description: "System-configured category that enables Road-Cutting Intelligence" },
  { key: "road.repeated_excavation_days", value: 90, description: "Days after restoration during which a new excavation receives an advisory warning" },
  { key: "coordination.request_types", value: ["utility-clearance", "dependency-request", "joint-inspection", "engineer-assistance", "document-information-request", "schedule-coordination", "road-cut-excavation-coordination", "other"], description: "Configurable structured request types for inter-agency coordination" },
] as const;

// Part III §9.3 — deterministic, progressively farther Jayanagar citizens
// power the nearest-15 and stale-batch demo/acceptance flow.
const communityValidators = Array.from({ length: 30 }, (_unused, index) => ({
  id: `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  role: UserRole.CITIZEN,
  phone: `+91987651${String(index + 1).padStart(4, "0")}`,
  wardId: ids.wards.jayanagar,
  phoneVerifiedAt: new Date(),
  latitude: 12.929 + (index + 1) * 0.0001,
  longitude: 77.5844,
}));

const engineerDemoProjects = [
  { suffix: "01", title: "Repair failed carriageway near Jayanagar 4th Block", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.ENGINEER_ASSIGNED, projectState: ProjectState.PENDING_UPTAKE, wardId: ids.wards.jayanagar, categoryId: categories[0].id, longitude: 77.5844, latitude: 12.9299, start: null, end: null },
  { suffix: "04", title: "Complete pothole patching near South End Circle", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.WORK_COMPLETED, projectState: ProjectState.COMPLETED, wardId: ids.wards.jayanagar, categoryId: categories[0].id, longitude: 77.5802, latitude: 12.9367, start: daysFromNow(-7), end: daysFromNow(-1) },
] as const;



async function seedWards(): Promise<void> {
  for (const ward of demoWards) {
    const boundary = demoWardBoundaryWkt(ward);
    await prisma.$executeRaw`
      INSERT INTO "Ward" ("id", "name", "boundary", "verificationRadiusOverrideMeters")
      VALUES (${ward.id}::uuid, ${ward.name}, ST_GeomFromText(${boundary}, ${DEMO_WARD_SRID}::integer), NULL)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "boundary" = EXCLUDED."boundary"
    `;
  }
}

async function seedEngineerWorkflowDemo(): Promise<void> {
  for (const item of engineerDemoProjects) {
    const ticketId = `50000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    const observationId = `60000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    const projectId = `70000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    await prisma.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt")
      VALUES (${ticketId}::uuid, ${item.categoryId}::uuid, ${"40000000-0000-4000-8000-000000000001"}::uuid,
        ${item.agencyId}::uuid, ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326), ${item.wardId}::uuid,
        ${item.ticketState}::"TicketState", ${item.title}, ${`${item.title}, Bengaluru`}, NOW(), NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "assignedAgencyId" = EXCLUDED."assignedAgencyId", "coordinates" = EXCLUDED."coordinates", "state" = EXCLUDED."state",
        "wardId" = EXCLUDED."wardId", "title" = EXCLUDED."title", "address" = EXCLUDED."address"
    `;
    await prisma.observation.upsert({
      where: { id: observationId },
      update: { imageUrl: `https://images.civicos.local/demo/${item.suffix}.jpg`, note: "Field evidence captured during initial assessment." },
      create: { id: observationId, ticketId, submitterId: "40000000-0000-4000-8000-000000000001", imageUrl: `https://images.civicos.local/demo/${item.suffix}.jpg`, note: "Field evidence captured during initial assessment." },
    });
    await prisma.image.upsert({
      where: { objectKey: `demo/engineer/${item.suffix}.jpg` },
      update: { url: `https://images.civicos.local/demo/${item.suffix}.jpg`, uploadedAt: new Date() },
      create: { observationId, url: `https://images.civicos.local/demo/${item.suffix}.jpg`, objectKey: `demo/engineer/${item.suffix}.jpg`, isPrimary: true, uploadedAt: new Date() },
    });
    await prisma.inspectionReport.upsert({
      where: { objectKey: `demo/engineer/${item.suffix}-inspection.pdf` },
      update: { notes: "Site inspected; execution scope and safety controls confirmed.", uploadedAt: new Date() },
      create: {
        ticketId,
        assignedEngineerId: item.engineerId,
        assignedById: item.agencyId === ids.agencies.pwd ? "40000000-0000-4000-8000-000000000101" : "40000000-0000-4000-8000-000000000102",
        submittedById: item.engineerId,
        deadline: item.start ?? new Date(Date.now() + 2 * 86_400_000),
        status: InspectionStatus.REVIEWED,
        acceptedAt: new Date(),
        startedAt: new Date(),
        submittedAt: new Date(),
        reviewedAt: new Date(),
        issueConfirmation: InspectionIssueConfirmation.CONFIRMED,
        severity: InspectionSeverity.MEDIUM,
        observations: "Site inspected; execution scope and safety controls confirmed.",
        recommendedWork: "Proceed with the scoped repair and documented safety controls.",
        complexity: InspectionComplexity.MEDIUM,
        coordinationRequired: item.agencyId === ids.agencies.pwd,
        recommendation: InspectionRecommendation.PROCEED,
        latitude: item.latitude,
        longitude: item.longitude,
        locationConfirmedAt: new Date(),
        fileUrl: `https://images.civicos.local/demo/${item.suffix}-inspection.pdf`,
        objectKey: `demo/engineer/${item.suffix}-inspection.pdf`,
        contentType: "application/pdf",
        notes: "Site inspected; execution scope and safety controls confirmed.",
        uploadedAt: new Date(),
      },
    });
    await prisma.project.upsert({
      where: { id: projectId },
      update: { agencyId: item.agencyId, engineerId: item.engineerId, state: item.projectState, plannedStart: item.start, plannedEnd: item.end, workDescription: item.start ? "Execute the inspected scope with field safety controls and restore the public area." : null, dependencyFlags: item.agencyId === ids.agencies.pwd ? ["Traffic coordination"] : ["Road restoration coordination"] },
      create: { id: projectId, ticketId, categoryId: item.categoryId, agencyId: item.agencyId, wardId: item.wardId, ownerProjectHeadId: "40000000-0000-4000-8000-000000000101", createdById: "40000000-0000-4000-8000-000000000101", updatedById: "40000000-0000-4000-8000-000000000101", origin: CivicWorkOrigin.CITIZEN_REPORTED, title: item.title, locationLabel: `${item.title}, Bengaluru`, engineerId: item.engineerId, state: item.projectState, plannedStart: item.start, plannedEnd: item.end, workDescription: item.start ? "Execute the inspected scope with field safety controls and restore the public area." : null, dependencyFlags: item.agencyId === ids.agencies.pwd ? ["Traffic coordination"] : ["Road restoration coordination"] },
    });
    await prisma.$executeRaw`
      UPDATE "Project" AS project SET "geometry" = ticket."coordinates"
      FROM "Ticket" AS ticket WHERE project."id" = ${projectId}::uuid AND ticket."id" = ${ticketId}::uuid
    `;
    const actionType = item.projectState === ProjectState.PENDING_UPTAKE ? WorkflowActionType.ACCEPT_PROJECT : WorkflowActionType.SUBMIT_COMPLETION;
    await prisma.workflowAction.upsert({
      where: { dedupeKey: item.projectState === ProjectState.PENDING_UPTAKE ? `project:${projectId}:accept` : `project:${projectId}:submit-completion` },
      update: { type: actionType, ticketId, projectId, responsibleUserId: item.engineerId, responsibleAgencyId: item.agencyId, deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), respondedAt: null, attentionNotifiedAt: null },
      create: { dedupeKey: item.projectState === ProjectState.PENDING_UPTAKE ? `project:${projectId}:accept` : `project:${projectId}:submit-completion`, type: actionType, ticketId, projectId, responsibleUserId: item.engineerId, responsibleAgencyId: item.agencyId, deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
    });
    if (item.suffix === "01") {
      const dependencyId = "72000000-0000-4000-8000-000000000001";
      await prisma.dependency.upsert({
        where: { id: dependencyId },
        update: { projectId, requestingAgencyId: ids.agencies.pwd, respondingAgencyId: ids.agencies.traffic, assignedEngineerId: null, state: DependencyState.PENDING_RESPONSE, requirement: "Coordinate a temporary traffic diversion before carriageway repair begins.", deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), respondedAt: null, escalatedAt: null },
        create: { id: dependencyId, projectId, requestingAgencyId: ids.agencies.pwd, respondingAgencyId: ids.agencies.traffic, state: DependencyState.PENDING_RESPONSE, requirement: "Coordinate a temporary traffic diversion before carriageway repair begins.", deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      });
    }
    const transitionId = `71000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    await prisma.projectStateTransition.upsert({
      where: { id: transitionId },
      update: { toState: item.projectState, reason: "DEMO_WORKFLOW_STATE" },
      create: { id: transitionId, projectId, fromState: null, toState: item.projectState, reason: "DEMO_WORKFLOW_STATE", actedById: item.engineerId },
    });
    if (item.projectState === ProjectState.COMPLETED) {
      for (let number = 1; number <= 3; number += 1) {
        await prisma.validation.upsert({
          where: { ticketId_validatorId: { ticketId, validatorId: communityValidators[number - 1]!.id } },
          update: { vote: ValidationVote.CONFIRM, counted: true },
          create: { ticketId, validatorId: communityValidators[number - 1]!.id, vote: ValidationVote.CONFIRM, counted: true },
        });
      }
    }
  }
}

// Master Spec Part I §31 — a complete, non-road lifecycle that remains visible
// as one coherent audit trail after every rehearsal reset.
async function seedGeneralEndToEndDemo(): Promise<void> {
  const demo = ids.generalDemo;
  const reporterId = "40000000-0000-4000-8000-000000000002";
  const projectHeadId = "40000000-0000-4000-8000-000000000103";
  const engineerId = "40000000-0000-4000-8000-000000000203";
  const validatorIds = communityValidators.slice(0, 3).map(({ id }) => id);
  const at = (day: number, hour = 4) => new Date(daysAgo(21 - day).getTime() + hour * 3_600_000);
  const evidenceBaseUrl = "https://placehold.co/1200x800/e7ecf7/1f2937.jpg";

  await prisma.$executeRaw`
    INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "aiRetryCount", "createdAt", "updatedAt")
    VALUES (${demo.ticket}::uuid, ${categories[1].id}::uuid, ${reporterId}::uuid, ${ids.agencies.bescom}::uuid,
      ST_SetSRID(ST_MakePoint(77.5844, 12.9299), 4326), ${ids.wards.jayanagar}::uuid,
      ${TicketState.CLOSED}::"TicketState", 'Streetlight outage near Jayanagar 4th Block',
      '11th Main Road, Jayanagar 4th Block, Bengaluru', 1, ${at(1)}, ${at(9)})
    ON CONFLICT ("id") DO UPDATE SET
      "categoryId" = EXCLUDED."categoryId", "reporterId" = EXCLUDED."reporterId",
      "assignedAgencyId" = EXCLUDED."assignedAgencyId", "coordinates" = EXCLUDED."coordinates",
      "wardId" = EXCLUDED."wardId", "roadSegmentId" = NULL, "state" = EXCLUDED."state",
      "title" = EXCLUDED."title", "address" = EXCLUDED."address", "aiRetryCount" = EXCLUDED."aiRetryCount",
      "manualReviewRecommended" = FALSE, "duplicateReviewRecommended" = FALSE, "createdAt" = EXCLUDED."createdAt"
  `;

  await prisma.observation.upsert({
    where: { id: demo.observation },
    update: {
      ticketId: demo.ticket,
      submitterId: reporterId,
      imageUrl: `${evidenceBaseUrl}?text=Streetlight+outage+Jayanagar`,
      note: "Two consecutive streetlights are dark beside the metro exit, making the footpath unsafe after dusk.",
      latitude: 12.9299,
      longitude: 77.5844,
      address: "11th Main Road, Jayanagar 4th Block, Bengaluru",
      createdAt: at(1),
    },
    create: {
      id: demo.observation,
      ticketId: demo.ticket,
      submitterId: reporterId,
      imageUrl: `${evidenceBaseUrl}?text=Streetlight+outage+Jayanagar`,
      note: "Two consecutive streetlights are dark beside the metro exit, making the footpath unsafe after dusk.",
      latitude: 12.9299,
      longitude: 77.5844,
      address: "11th Main Road, Jayanagar 4th Block, Bengaluru",
      createdAt: at(1),
    },
  });
  await prisma.image.upsert({
    where: { id: demo.image },
    update: {
      observationId: demo.observation,
      url: `${evidenceBaseUrl}?text=Streetlight+outage+Jayanagar`,
      objectKey: "demo/general/streetlight-outage.jpg",
      isPrimary: true,
      aiRelevanceScore: 0.94,
      uploadedAt: at(1),
      createdAt: at(1),
    },
    create: {
      id: demo.image,
      observationId: demo.observation,
      url: `${evidenceBaseUrl}?text=Streetlight+outage+Jayanagar`,
      objectKey: "demo/general/streetlight-outage.jpg",
      isPrimary: true,
      aiRelevanceScore: 0.94,
      uploadedAt: at(1),
      createdAt: at(1),
    },
  });

  for (const [index, validatorId] of validatorIds.entries()) {
    const requestId = `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    await prisma.validationRequest.upsert({
      where: { ticketId_citizenId: { ticketId: demo.ticket, citizenId: validatorId } },
      update: { batchNumber: 1, distanceMeters: 180 + index * 55, notifiedAt: at(1, 5), expiresAt: at(4, 5), respondedAt: at(2, 5 + index) },
      create: { id: requestId, ticketId: demo.ticket, citizenId: validatorId, batchNumber: 1, distanceMeters: 180 + index * 55, notifiedAt: at(1, 5), expiresAt: at(4, 5), respondedAt: at(2, 5 + index) },
    });
    await prisma.validation.upsert({
      where: { ticketId_validatorId: { ticketId: demo.ticket, validatorId } },
      update: { vote: ValidationVote.CONFIRM, counted: true, createdAt: at(2, 5 + index) },
      create: { id: `92000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, ticketId: demo.ticket, validatorId, vote: ValidationVote.CONFIRM, counted: true, createdAt: at(2, 5 + index) },
    });
  }

  await prisma.inspectionReport.upsert({
    where: { id: demo.inspection },
    update: {
      ticketId: demo.ticket,
      assignedEngineerId: engineerId,
      assignedById: projectHeadId,
      submittedById: engineerId,
      deadline: at(4),
      status: InspectionStatus.REVIEWED,
      acceptedAt: at(3, 6),
      startedAt: at(3, 8),
      submittedAt: at(4),
      reviewedAt: at(4, 4),
      issueConfirmation: InspectionIssueConfirmation.CONFIRMED,
      severity: InspectionSeverity.HIGH,
      observations: "Inspection confirmed two failed LED luminaires and a damaged feeder junction.",
      recommendedWork: "Replace the luminaires and feeder junction after traffic-side access is coordinated.",
      complexity: InspectionComplexity.MEDIUM,
      coordinationRequired: true,
      otherAgencyInvolvement: "Bengaluru Traffic Police",
      recommendation: InspectionRecommendation.COORDINATION_REQUIRED,
      latitude: 12.9306,
      longitude: 77.5839,
      locationConfirmedAt: at(4),
      fileUrl: `${evidenceBaseUrl}?text=BESCOM+inspection+report`,
      objectKey: "demo/general/streetlight-inspection.jpg",
      contentType: "image/jpeg",
      notes: "Inspection confirmed two failed LED luminaires and a damaged feeder junction. Traffic-side access support requested.",
      uploadedAt: at(4),
      createdAt: at(4),
    },
    create: {
      id: demo.inspection,
      ticketId: demo.ticket,
      assignedEngineerId: engineerId,
      assignedById: projectHeadId,
      submittedById: engineerId,
      deadline: at(4),
      status: InspectionStatus.REVIEWED,
      acceptedAt: at(3, 6),
      startedAt: at(3, 8),
      submittedAt: at(4),
      reviewedAt: at(4, 4),
      issueConfirmation: InspectionIssueConfirmation.CONFIRMED,
      severity: InspectionSeverity.HIGH,
      observations: "Inspection confirmed two failed LED luminaires and a damaged feeder junction.",
      recommendedWork: "Replace the luminaires and feeder junction after traffic-side access is coordinated.",
      complexity: InspectionComplexity.MEDIUM,
      coordinationRequired: true,
      otherAgencyInvolvement: "Bengaluru Traffic Police",
      recommendation: InspectionRecommendation.COORDINATION_REQUIRED,
      latitude: 12.9306,
      longitude: 77.5839,
      locationConfirmedAt: at(4),
      fileUrl: `${evidenceBaseUrl}?text=BESCOM+inspection+report`,
      objectKey: "demo/general/streetlight-inspection.jpg",
      contentType: "image/jpeg",
      notes: "Inspection confirmed two failed LED luminaires and a damaged feeder junction. Traffic-side access support requested.",
      uploadedAt: at(4),
      createdAt: at(4),
    },
  });

  await prisma.project.upsert({
    where: { id: demo.project },
    update: {
      ticketId: demo.ticket,
      agencyId: ids.agencies.bescom,
      engineerId,
      state: ProjectState.CLOSED,
      plannedStart: at(7),
      plannedEnd: at(9, 12),
      workDescription: "Isolate the feeder, replace both LED luminaires and junction components, then test illumination after dusk.",
      dependencyFlags: ["Traffic-side access support"],
      createdAt: at(5),
    },
    create: {
      id: demo.project,
      ticketId: demo.ticket,
      categoryId: categories[1].id,
      agencyId: ids.agencies.bescom,
      wardId: ids.wards.jayanagar,
      ownerProjectHeadId: projectHeadId,
      createdById: projectHeadId,
      updatedById: projectHeadId,
      origin: CivicWorkOrigin.CITIZEN_REPORTED,
      title: "Restore streetlights beside Jayanagar metro exit",
      locationLabel: "11th Main Road, Jayanagar 4th Block, Bengaluru",
      engineerId,
      state: ProjectState.CLOSED,
      plannedStart: at(7),
      plannedEnd: at(9, 12),
      workDescription: "Isolate the feeder, replace both LED luminaires and junction components, then test illumination after dusk.",
      dependencyFlags: ["Traffic-side access support"],
      createdAt: at(5),
    },
  });
  await prisma.$executeRaw`
    UPDATE "Project" AS project SET "geometry" = ticket."coordinates"
    FROM "Ticket" AS ticket WHERE project."id" = ${demo.project}::uuid AND ticket."id" = ${demo.ticket}::uuid
  `;
  await prisma.dependency.upsert({
    where: { id: demo.dependency },
    update: {
      projectId: demo.project,
      requestingAgencyId: ids.agencies.bescom,
      respondingAgencyId: ids.agencies.pwd,
      assignedEngineerId: "40000000-0000-4000-8000-000000000201",
      state: DependencyState.FULFILLED,
      requirement: "Provide a safe roadside work zone and temporary access protection for the lighting crew.",
      deadline: at(7),
      respondedAt: at(5, 8),
      createdAt: at(5, 5),
    },
    create: {
      id: demo.dependency,
      projectId: demo.project,
      requestingAgencyId: ids.agencies.bescom,
      respondingAgencyId: ids.agencies.pwd,
      assignedEngineerId: "40000000-0000-4000-8000-000000000201",
      state: DependencyState.FULFILLED,
      requirement: "Provide a safe roadside work zone and temporary access protection for the lighting crew.",
      deadline: at(7),
      respondedAt: at(5, 8),
      createdAt: at(5, 5),
    },
  });
  const dependencyTransitions = [
    { fromState: null, toState: DependencyState.PENDING_RESPONSE, reason: "DEPENDENCY_REQUESTED", actedById: projectHeadId, createdAt: at(5, 5) },
    { fromState: DependencyState.PENDING_RESPONSE, toState: DependencyState.ASSIGNED, reason: "ENGINEER_ASSIGNED", actedById: "40000000-0000-4000-8000-000000000101", createdAt: at(5, 8) },
    { fromState: DependencyState.ASSIGNED, toState: DependencyState.FULFILLED, reason: "FIELD_SUPPORT_COMPLETED", actedById: "40000000-0000-4000-8000-000000000201", createdAt: at(7, 3) },
  ] as const;
  for (const [index, transition] of dependencyTransitions.entries()) {
    await prisma.dependencyStateTransition.upsert({
      where: { id: `93000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
      update: transition,
      create: { id: `93000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, dependencyId: demo.dependency, ...transition },
    });
  }

  await prisma.projectWorkNote.upsert({
    where: { id: demo.workNote },
    update: { projectId: demo.project, authorId: engineerId, note: "Both luminaires replaced; feeder junction sealed and evening illumination test passed.", createdAt: at(9, 11) },
    create: { id: demo.workNote, projectId: demo.project, authorId: engineerId, note: "Both luminaires replaced; feeder junction sealed and evening illumination test passed.", createdAt: at(9, 11) },
  });
  await prisma.completionEvidence.upsert({
    where: { id: demo.completionEvidence },
    update: {
      projectId: demo.project,
      ticketId: demo.ticket,
      submittedById: engineerId,
      photoUrl: `${evidenceBaseUrl}?text=Streetlights+restored`,
      objectKey: "demo/general/streetlight-completed.jpg",
      contentType: "image/jpeg",
      notes: "Both lights operational after dusk; junction enclosure and work area restored.",
      uploadedAt: at(9, 13),
      createdAt: at(9, 12),
    },
    create: {
      id: demo.completionEvidence,
      projectId: demo.project,
      ticketId: demo.ticket,
      submittedById: engineerId,
      photoUrl: `${evidenceBaseUrl}?text=Streetlights+restored`,
      objectKey: "demo/general/streetlight-completed.jpg",
      contentType: "image/jpeg",
      notes: "Both lights operational after dusk; junction enclosure and work area restored.",
      uploadedAt: at(9, 13),
      createdAt: at(9, 12),
    },
  });
  for (const [index, validatorId] of validatorIds.entries()) {
    await prisma.completionVerificationRequest.upsert({
      where: { completionEvidenceId_citizenId: { completionEvidenceId: demo.completionEvidence, citizenId: validatorId } },
      update: { notifiedAt: at(9, 13), respondedAt: at(10, 5 + index) },
      create: { id: `94000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, completionEvidenceId: demo.completionEvidence, citizenId: validatorId, notifiedAt: at(9, 13), respondedAt: at(10, 5 + index) },
    });
    await prisma.completionVerification.upsert({
      where: { completionEvidenceId_validatorId: { completionEvidenceId: demo.completionEvidence, validatorId } },
      update: { decision: CompletionVerificationDecision.VERIFIED, note: "Lighting is restored and the footpath is visibly illuminated.", createdAt: at(10, 5 + index) },
      create: { id: `95000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, completionEvidenceId: demo.completionEvidence, validatorId, decision: CompletionVerificationDecision.VERIFIED, note: "Lighting is restored and the footpath is visibly illuminated.", createdAt: at(10, 5 + index) },
    });
  }

  const ticketStates = [
    TicketState.DRAFT,
    TicketState.AI_CHECK_PENDING,
    TicketState.PENDING_VALIDATION,
    TicketState.VALIDATED,
    TicketState.ROUTED_TO_AGENCY,
    TicketState.INSPECTION_DUE,
    TicketState.INSPECTION_COMPLETE,
    TicketState.PROJECT_CREATED,
    TicketState.ENGINEER_ASSIGNED,
    TicketState.WORK_IN_PROGRESS,
    TicketState.WORK_COMPLETED,
    TicketState.AWAITING_CITIZEN_VERIFICATION,
    TicketState.CLOSED,
  ];
  for (const [index, toState] of ticketStates.entries()) {
    await prisma.ticketStateTransition.upsert({
      where: { id: `96000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
      update: { ticketId: demo.ticket, fromState: index === 0 ? null : ticketStates[index - 1], toState, reason: "PART_I_31_DEMO", createdAt: at(Math.min(index + 1, 10), 4 + index % 5) },
      create: { id: `96000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, ticketId: demo.ticket, fromState: index === 0 ? null : ticketStates[index - 1], toState, reason: "PART_I_31_DEMO", createdAt: at(Math.min(index + 1, 10), 4 + index % 5) },
    });
  }
  const projectStates = [ProjectState.CREATED, ProjectState.PENDING_UPTAKE, ProjectState.UPTAKEN, ProjectState.TIMELINE_SET, ProjectState.CONFLICT_CHECKED, ProjectState.READY_TO_START, ProjectState.ACTIVE, ProjectState.COMPLETED, ProjectState.AWAITING_VERIFICATION, ProjectState.CLOSED];
  for (const [index, toState] of projectStates.entries()) {
    await prisma.projectStateTransition.upsert({
      where: { id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
      update: { projectId: demo.project, fromState: index === 0 ? null : projectStates[index - 1], toState, reason: "PART_I_31_DEMO", actedById: index < 2 ? projectHeadId : index === projectStates.length - 1 ? validatorIds[2] : engineerId, createdAt: at(5 + Math.min(index, 5), 5 + index) },
      create: { id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, projectId: demo.project, fromState: index === 0 ? null : projectStates[index - 1], toState, reason: "PART_I_31_DEMO", actedById: index < 2 ? projectHeadId : index === projectStates.length - 1 ? validatorIds[2] : engineerId, createdAt: at(5 + Math.min(index, 5), 5 + index) },
    });
  }
}

// Delta §6 — deterministic flagship story: pipeline → cable → consolidated restoration → resurfacing.
async function seedRoadCuttingDemo(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType", "lastRestorationDate")
    VALUES (${ids.roadSegments.flagship}::uuid, 'Segment X · 11th Main Road',
      ST_GeomFromText('LINESTRING(77.5825 12.9280,77.5870 12.9300)', 4326),
      ${ids.wards.jayanagar}::uuid, 'Asphalt', ${daysFromNow(-30)})
    ON CONFLICT ("id") DO UPDATE SET "roadName" = EXCLUDED."roadName", "geometry" = EXCLUDED."geometry",
      "wardId" = EXCLUDED."wardId", "surfaceType" = EXCLUDED."surfaceType", "lastRestorationDate" = EXCLUDED."lastRestorationDate"
  `;

  const work = [
    { suffix: "01", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", title: "Planned resurfacing on Segment X", purpose: "resurfacing", start: daysFromNow(12), end: daysFromNow(16), offset: 0, length: 420, refs: [] as string[] },
    { suffix: "02", agencyId: ids.agencies.bwssb, engineerId: "40000000-0000-4000-8000-000000000202", title: "BWSSB pipeline intervention on Segment X", purpose: "pipeline", start: daysFromNow(2), end: daysFromNow(8), offset: 20, length: 260, refs: [] as string[] },
    { suffix: "03", agencyId: ids.agencies.bescom, engineerId: "40000000-0000-4000-8000-000000000203", title: "BESCOM cable intervention on Segment X", purpose: "cable", start: daysFromNow(7), end: daysFromNow(10), offset: 100, length: 180, refs: ["83000000-0000-4000-8000-000000000002"] },
  ] as const;

  const projectIds = work.map((item) => `82000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`);
  // Delta §6 rehearsal reset — remove mutable warning/action history before
  // restoring the exact scripted timelines. Core fixtures are upserted below.
  await prisma.sequencingRecommendation.deleteMany({ where: { segmentId: ids.roadSegments.flagship } });
  await prisma.roadConflictLog.deleteMany({ where: { segmentId: ids.roadSegments.flagship } });
  await prisma.conflictLog.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { conflictingProjectId: { in: projectIds } }] } });
  await prisma.projectStateTransition.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'segmentId' = ${ids.roadSegments.flagship}`;

  for (const item of work) {
    const ticketId = `81000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    const projectId = `82000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    const interventionId = `83000000-0000-4000-8000-${item.suffix.padStart(12, "0")}`;
    await prisma.$executeRaw`
      INSERT INTO "Ticket" ("id", "categoryId", "assignedAgencyId", "coordinates", "wardId", "roadSegmentId", "state", "title", "address", "createdAt", "updatedAt")
      VALUES (${ticketId}::uuid, ${categories[0].id}::uuid, ${item.agencyId}::uuid,
        ST_SetSRID(ST_MakePoint(77.5845, 12.9290), 4326), ${ids.wards.jayanagar}::uuid,
        ${ids.roadSegments.flagship}::uuid, ${TicketState.WORK_IN_PROGRESS}::"TicketState", ${item.title}, '11th Main Road, Jayanagar, Bengaluru', NOW(), NOW())
      ON CONFLICT ("id") DO UPDATE SET "assignedAgencyId" = EXCLUDED."assignedAgencyId", "roadSegmentId" = EXCLUDED."roadSegmentId",
        "coordinates" = EXCLUDED."coordinates", "wardId" = EXCLUDED."wardId", "state" = EXCLUDED."state",
        "title" = EXCLUDED."title", "address" = EXCLUDED."address"
    `;
    await prisma.project.upsert({
      where: { id: projectId },
      update: { agencyId: item.agencyId, engineerId: item.engineerId, state: ProjectState.ACTIVE, plannedStart: item.start, plannedEnd: item.end, actualStart: item.start, workDescription: item.title },
      create: { id: projectId, ticketId, categoryId: categories[0].id, agencyId: item.agencyId, wardId: ids.wards.jayanagar, ownerProjectHeadId: item.agencyId === ids.agencies.pwd ? "40000000-0000-4000-8000-000000000101" : item.agencyId === ids.agencies.bwssb ? "40000000-0000-4000-8000-000000000102" : "40000000-0000-4000-8000-000000000103", origin: CivicWorkOrigin.AGENCY_PLANNED, title: item.title, locationLabel: "Segment X · 11th Main Road, Jayanagar", engineerId: item.engineerId, state: ProjectState.ACTIVE, plannedStart: item.start, plannedEnd: item.end, actualStart: item.start, workDescription: item.title },
    });
    await prisma.workflowAction.upsert({
      where: { dedupeKey: `project:${projectId}:complete-work` },
      update: { type: WorkflowActionType.COMPLETE_WORK, ticketId, projectId, responsibleUserId: item.engineerId, responsibleAgencyId: item.agencyId, deadline: item.end, respondedAt: null, attentionNotifiedAt: null },
      create: { dedupeKey: `project:${projectId}:complete-work`, type: WorkflowActionType.COMPLETE_WORK, ticketId, projectId, responsibleUserId: item.engineerId, responsibleAgencyId: item.agencyId, deadline: item.end },
    });
    await prisma.intervention.upsert({
      where: { projectId },
      update: { segmentId: ids.roadSegments.flagship, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, startOffsetM: item.offset, affectedLengthM: item.length, dependencyRefs: [...item.refs] },
      create: { id: interventionId, projectId, segmentId: ids.roadSegments.flagship, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, startOffsetM: item.offset, affectedLengthM: item.length, dependencyRefs: [...item.refs] },
    });
    await prisma.$executeRaw`
      UPDATE "Project" AS project SET "geometry" = segment."geometry"
      FROM "RoadSegment" AS segment WHERE project."id" = ${projectId}::uuid AND segment."id" = ${ids.roadSegments.flagship}::uuid
    `;
  }
}

// Phase 4 — deterministic BTM handoff starts at the conflict-review step.
// The demo operator can then perform request → reply → assignment/inspection →
// dependency acceptance → advisory sequence/date update in the web workspace.
async function seedPhase4CoordinationDemo(): Promise<void> {
  const fixture = ids.phase4Coordination;
  const projectIds = [fixture.resurfacingProject, fixture.pipelineProject];
  await prisma.coordinationRequest.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.dependency.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.sequencingRecommendation.deleteMany({ where: { segmentId: ids.roadSegments.btmCoordination } });
  await prisma.roadConflictLog.deleteMany({ where: { segmentId: ids.roadSegments.btmCoordination } });
  await prisma.projectWorkNote.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectEvidence.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectStateTransition.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectAuditEvent.deleteMany({ where: { projectId: { in: projectIds } } });
  for (const projectId of projectIds) {
    await prisma.$executeRaw`DELETE FROM "Notification" WHERE "payload"->>'projectId' = ${projectId}`;
  }

  await prisma.$executeRaw`
    INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType", "lastRestorationDate")
    VALUES (${ids.roadSegments.btmCoordination}::uuid, '16th Main Road · BTM Layout 2nd Stage',
      ST_GeomFromText('LINESTRING(77.6075 12.9142,77.6125 12.9142)', 4326),
      ${ids.wards.btmLayout}::uuid, 'Asphalt', NULL)
    ON CONFLICT ("id") DO UPDATE SET "roadName" = EXCLUDED."roadName", "geometry" = EXCLUDED."geometry",
      "wardId" = EXCLUDED."wardId", "surfaceType" = EXCLUDED."surfaceType", "lastRestorationDate" = NULL
  `;

  const works = [
    {
      id: fixture.resurfacingProject,
      interventionId: fixture.resurfacingIntervention,
      agencyId: ids.agencies.pwd,
      ownerId: "40000000-0000-4000-8000-000000000104",
      engineerId: "40000000-0000-4000-8000-000000000204",
      title: "BBMP Road Resurfacing · BTM 16th Main",
      purpose: "resurfacing",
      start: daysFromNow(6),
      end: daysFromNow(13),
    },
    {
      id: fixture.pipelineProject,
      interventionId: fixture.pipelineIntervention,
      agencyId: ids.agencies.bwssb,
      ownerId: "40000000-0000-4000-8000-000000000102",
      engineerId: "40000000-0000-4000-8000-000000000202",
      title: "BWSSB pipeline replacement · BTM 16th Main",
      purpose: "pipeline",
      start: daysFromNow(3),
      end: daysFromNow(10),
    },
  ] as const;

  for (const [index, item] of works.entries()) {
    await prisma.project.upsert({
      where: { id: item.id },
      update: { categoryId: categories[0].id, agencyId: item.agencyId, ownerProjectHeadId: item.ownerId, createdById: item.ownerId, updatedById: item.ownerId, origin: CivicWorkOrigin.AGENCY_PLANNED, title: item.title, description: "SIH BTM coordination demonstration on the same road chainage.", locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru", wardId: ids.wards.btmLayout, state: ProjectState.READY_TO_START, plannedStart: item.start, plannedEnd: item.end, workDescription: item.title, engineerId: item.engineerId },
      create: { id: item.id, categoryId: categories[0].id, agencyId: item.agencyId, ownerProjectHeadId: item.ownerId, createdById: item.ownerId, updatedById: item.ownerId, origin: CivicWorkOrigin.AGENCY_PLANNED, title: item.title, description: "SIH BTM coordination demonstration on the same road chainage.", locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru", wardId: ids.wards.btmLayout, state: ProjectState.READY_TO_START, plannedStart: item.start, plannedEnd: item.end, workDescription: item.title, engineerId: item.engineerId },
    });
    await prisma.intervention.upsert({
      where: { projectId: item.id },
      update: { segmentId: ids.roadSegments.btmCoordination, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, affectedLengthM: 380, startOffsetM: 20, dependencyRefs: [] },
      create: { id: item.interventionId, projectId: item.id, segmentId: ids.roadSegments.btmCoordination, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, affectedLengthM: 380, startOffsetM: 20, dependencyRefs: [] },
    });
    await prisma.$executeRaw`UPDATE "Project" SET "geometry" = (SELECT "geometry" FROM "RoadSegment" WHERE "id" = ${ids.roadSegments.btmCoordination}::uuid) WHERE "id" = ${item.id}::uuid`;
    const transitionId = index === 0 ? fixture.resurfacingTransition : fixture.pipelineTransition;
    const auditId = index === 0 ? fixture.resurfacingAudit : fixture.pipelineAudit;
    await prisma.projectStateTransition.create({
      data: {
        id: transitionId,
        projectId: item.id,
        fromState: ProjectState.CREATED,
        toState: ProjectState.READY_TO_START,
        reason: "PLANNED_WORK_CONFLICT_CHECKED",
        actedById: item.ownerId,
      },
    });
    await prisma.projectAuditEvent.create({
      data: {
        id: auditId,
        projectId: item.id,
        action: "PLANNED_WORK_CREATED",
        actorId: item.ownerId,
        metadata: { seeded: true, fixture: "BTM_SIH_COORDINATION" },
      },
    });
  }

  const fingerprint = "4444444444444444444444444444444444444444444444444444444444444444";
  await prisma.roadConflictLog.create({ data: {
    id: fixture.conflict,
    projectId: fixture.resurfacingProject,
    conflictingProjectId: fixture.pipelineProject,
    segmentId: ids.roadSegments.btmCoordination,
    projectAgencyId: ids.agencies.pwd,
    conflictingAgencyId: ids.agencies.bwssb,
    type: RoadConflictType.RESTORATION_TOO_EARLY,
    severity: RoadConflictSeverity.HIGH,
    reason: "Road resurfacing begins before the scheduled BWSSB pipeline excavation is complete on the same segment. Advisory only.",
    fingerprint,
  } });
}

// Phase 1 — standalone registry fixtures prove work no longer needs a citizen
// complaint. The first two deliberately overlap in BTM Layout for a later
// geographic/temporal conflict demonstration; warnings remain advisory.
async function seedPlannedCivicWorks(): Promise<void> {
  const planned = [
    {
      id: ids.plannedWorks.btmPipeline,
      categoryId: categories[2].id,
      agencyId: ids.agencies.bwssb,
      ownerId: "40000000-0000-4000-8000-000000000102",
      title: "BTM 2nd Stage water-main replacement",
      description: "Replace the aging distribution main and reinstate the affected carriageway along 16th Main Road.",
      locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru",
      start: daysFromNow(4),
      end: daysFromNow(14),
      geometry: { type: "LineString", coordinates: [[77.6075, 12.9142], [77.6125, 12.9142]] },
    },
    {
      id: ids.plannedWorks.btmCable,
      categoryId: categories[5].id,
      agencyId: ids.agencies.bescom,
      ownerId: "40000000-0000-4000-8000-000000000103",
      title: "BESCOM underground cable maintenance",
      description: "Replace a deteriorated underground feeder cable and inspect jointing pits on the shared corridor.",
      locationLabel: "16th Main Road, BTM Layout 2nd Stage, Bengaluru",
      start: daysFromNow(9),
      end: daysFromNow(12),
      geometry: { type: "LineString", coordinates: [[77.6090, 12.9142], [77.6130, 12.9142]] },
    },
    {
      id: ids.plannedWorks.btmDrainage,
      categoryId: categories[3].id,
      agencyId: ids.agencies.bwssb,
      ownerId: "40000000-0000-4000-8000-000000000102",
      title: "BTM storm-drain desilting and repair",
      description: "Desilt the secondary drain, repair two damaged covers, and document pre-monsoon flow restoration.",
      locationLabel: "7th Cross Road, BTM Layout 1st Stage, Bengaluru",
      start: daysFromNow(15),
      end: daysFromNow(19),
      geometry: { type: "Point", coordinates: [77.6170, 12.9180] },
    },
  ] as const;

  for (const [index, item] of planned.entries()) {
    await prisma.project.upsert({
      where: { id: item.id },
      update: {
        categoryId: item.categoryId, agencyId: item.agencyId, wardId: ids.wards.btmLayout,
        ownerProjectHeadId: item.ownerId, createdById: item.ownerId, updatedById: item.ownerId,
        origin: CivicWorkOrigin.AGENCY_PLANNED, title: item.title, description: item.description,
        workDescription: item.description, locationLabel: item.locationLabel,
        plannedStart: item.start, plannedEnd: item.end, state: ProjectState.TIMELINE_SET,
      },
      create: {
        id: item.id, categoryId: item.categoryId, agencyId: item.agencyId, wardId: ids.wards.btmLayout,
        ownerProjectHeadId: item.ownerId, createdById: item.ownerId, updatedById: item.ownerId,
        origin: CivicWorkOrigin.AGENCY_PLANNED, title: item.title, description: item.description,
        workDescription: item.description, locationLabel: item.locationLabel,
        plannedStart: item.start, plannedEnd: item.end, state: ProjectState.TIMELINE_SET,
      },
    });
    await prisma.$executeRaw`
      UPDATE "Project" SET "geometry" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(item.geometry)}), 4326)
      WHERE "id" = ${item.id}::uuid
    `;
    await prisma.projectStateTransition.upsert({
      where: { id: `89000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
      update: { projectId: item.id, fromState: ProjectState.CREATED, toState: ProjectState.TIMELINE_SET, reason: "PLANNED_TIMELINE_REGISTERED", actedById: item.ownerId },
      create: { id: `89000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, projectId: item.id, fromState: ProjectState.CREATED, toState: ProjectState.TIMELINE_SET, reason: "PLANNED_TIMELINE_REGISTERED", actedById: item.ownerId },
    });
    await prisma.projectAuditEvent.upsert({
      where: { id: `8a000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` },
      update: { projectId: item.id, action: "PLANNED_WORK_CREATED", actorId: item.ownerId, metadata: { seeded: true } },
      create: { id: `8a000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, projectId: item.id, action: "PLANNED_WORK_CREATED", actorId: item.ownerId, metadata: { seeded: true } },
    });
  }
}

// Preserve existing IDs and login emails because assignments and demo scripts use them.
const pwdDemoEngineers = [
  { id: "40000000-0000-4000-8000-000000000201", displayName: "Engineer 1", email: "engineer.pwd@civicos.local" },
  { id: "40000000-0000-4000-8000-000000000204", displayName: "Engineer 2", email: "engineer.bbmp@civicos.local" },
  { id: "40000000-0000-4000-8000-000000000205", displayName: "Engineer 3", email: "engineer03.pwd@civicos.local" },
];

async function seedPwdDemoEngineers(passwordHash: string): Promise<void> {
  const transaction = prisma;
  {
    for (const engineer of pwdDemoEngineers) {
      await transaction.user.upsert({
        where: { id: engineer.id },
        update: { displayName: engineer.displayName },
        create: { ...engineer, role: UserRole.ENGINEER, agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
      });
    }
    // Retire only the unused fourth fixture from earlier seeds; never remove its history.
    const retiredId = "40000000-0000-4000-8000-000000000206";
    const retired = await transaction.user.findUnique({ where: { id: retiredId }, select: { _count: { select: { engineeringProjects: true, assignedInspections: true, assignedDependencies: true, coordinationAssignments: true, responsibleActions: true } } } });
    if (retired && Object.values(retired._count).some((count) => count > 0)) throw new Error("The retired fourth demo engineer has assignments; preserve them and reconcile before seeding the three-person team.");
    await transaction.user.updateMany({ where: { id: retiredId, agencyId: ids.agencies.pwd, role: UserRole.ENGINEER, deactivatedAt: null }, data: { deactivatedAt: new Date() } });
  }
}

async function seedDataset(): Promise<void> {
  await seedWards();
  for (const agency of agencies) {
    await prisma.agency.upsert({
      where: { id: agency.id },
      update: { name: agency.name, type: agency.type },
      create: agency,
    });
  }

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, primaryAgencyId: category.primaryAgencyId, isConfigurable: true },
      create: { ...category, isConfigurable: true },
    });
  }

  await prisma.routingRule.deleteMany();
  await prisma.routingRule.createMany({
    data: routingRules.map(([categoryId, dependencyAgencyId]) => ({
      categoryId,
      dependencyAgencyId,
    })),
  });

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: { key: config.key, value: config.value, description: config.description },
    });
  }

  const passwordHash = await bcrypt.hash(demoInternalPassword, 12);
  const users: Array<Prisma.UserUncheckedCreateInput & { latitude?: number; longitude?: number }> = [
    { id: "40000000-0000-4000-8000-000000000001", role: UserRole.CITIZEN, phone: "+919876500001", email: "citizen.jayanagar@cityconnect.local", passwordHash, mustResetPassword: false, wardId: ids.wards.jayanagar, phoneVerifiedAt: new Date(), latitude: 12.9299, longitude: 77.5844 },
    { id: "40000000-0000-4000-8000-000000000002", role: UserRole.CITIZEN, phone: "+919876500002", email: "citizen.jayanagar.2@cityconnect.local", passwordHash, mustResetPassword: false, wardId: ids.wards.jayanagar, phoneVerifiedAt: new Date(), latitude: 12.9288, longitude: 77.5861 },
    { id: "40000000-0000-4000-8000-000000000003", role: UserRole.CITIZEN, phone: "+919876500003", email: "citizen.jayanagar.3@cityconnect.local", passwordHash, mustResetPassword: false, wardId: ids.wards.jayanagar, phoneVerifiedAt: new Date(), latitude: 12.9268, longitude: 77.5896 },
    ...communityValidators.map((citizen, index) => ({
      ...citizen,
      email: `validator${String(index + 1).padStart(2, "0")}@cityconnect.local`,
      passwordHash,
      mustResetPassword: false,
    })),
    { id: "40000000-0000-4000-8000-000000000101", role: UserRole.PROJECT_HEAD, displayName: "Meera Iyer", email: "head.pwd@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000102", role: UserRole.PROJECT_HEAD, displayName: "Farah Khan", email: "head.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000103", role: UserRole.PROJECT_HEAD, displayName: "Ananya Rao", email: "head.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000104", role: UserRole.PROJECT_HEAD, displayName: "Prakash Menon", email: "head.bbmp@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000202", role: UserRole.ENGINEER, displayName: "Neha Kulkarni", email: "engineer.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000203", role: UserRole.ENGINEER, displayName: "Sanjay Prasad", email: "engineer.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
  ];

  for (const user of users) {
    const { latitude, longitude, ...userData } = user;
    await prisma.user.upsert({
      where: { id: user.id },
      update: userData,
      create: userData,
    });
    if (latitude !== undefined && longitude !== undefined) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "lastKnownCoordinates" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
        WHERE "id" = ${user.id}::uuid
      `;
    }
  }

  await seedPwdDemoEngineers(passwordHash);
  await seedEngineerWorkflowDemo();
  await seedGeneralEndToEndDemo();
  await seedRoadCuttingDemo();
  await seedPhase4CoordinationDemo();
  await seedPlannedCivicWorks();
  await seedFreshScenarios();
  await reconcileDemoHistory();
  await prisma.systemConfig.upsert({ where: { key: "demo.seeded_at" }, create: { key: "demo.seeded_at", value: seedNow.toISOString(), description: "Fresh demo reset timestamp" }, update: { value: seedNow.toISOString() } });

  console.log(`Seeded ${demoWards.length} wards, ${agencies.length} agencies, ${categories.length} categories, and ${users.length} users.`);
  console.log(`Seeded ${engineerDemoProjects.length} Executive Engineer demo projects.`);
  console.log("Seeded the Part I §31 closed streetlight lifecycle with validation, dependency, execution, and citizen verification history.");
  console.log("Seeded Segment X flagship road-cutting scenario (PWD, BWSSB, BESCOM).");
  console.log("Seeded the SIH BTM conflict-to-coordination scenario (BBMP resurfacing and BWSSB pipeline work).");
  console.log("Seeded three standalone planned works in BTM Layout, including an intentional overlapping pair.");
  console.log(process.env.DEMO_INTERNAL_PASSWORD
    ? "Internal demo-user password loaded from DEMO_INTERNAL_PASSWORD."
    : "Internal demo-user password uses the development-only repository fallback.");
}

// Fresh operational fixtures complement the complete citizen streetlight story above.
async function seedFreshScenarios(): Promise<void> {
  const head = "40000000-0000-4000-8000-000000000101";
  const citizen = "40000000-0000-4000-8000-000000000001";
  const [e1, e2, e3] = pwdDemoEngineers.map((e) => e.id) as [string, string, string];
  const workId = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const extraAgencies = [ids.agencies.traffic, ids.agencies.drainage, ids.agencies.waste, ids.agencies.telecom];
  const passwordHash = await bcrypt.hash(demoInternalPassword, 12);
  const telecomCategory = "30000000-0000-4000-8000-000000000013";
  await prisma.category.create({ data: { id: telecomCategory, name: "Telecom Utilities", relevancePrompt: "damaged communication cables, open utility ducts or a damaged telecom cabinet", primaryAgencyId: ids.agencies.telecom } });
  for (const [i, agencyId] of extraAgencies.entries()) {
    const projectHeadId = `40000000-0000-4000-8000-${String(111 + i).padStart(12, "0")}`;
    const engineerId = `40000000-0000-4000-8000-${String(211 + i).padStart(12, "0")}`;
    const key = ["traffic", "drainage", "waste", "telecom"][i]!;
    await prisma.user.create({ data: { id: projectHeadId, role: UserRole.PROJECT_HEAD, displayName: ["Ravi Kumar", "Lakshmi Rao", "Kavya Rao", "Arjun Menon"][i], email: `head.${key}@civicos.local`, agencyId, passwordHash } });
    await prisma.user.create({ data: { id: engineerId, role: UserRole.ENGINEER, displayName: ["Naveen Rao", "Priya Shetty", "Asha Kumar", "Vikram Rao"][i], email: `engineer.${key}@civicos.local`, agencyId, passwordHash } });
    const title = ["HSR junction signal maintenance", "BTM storm-water drain restoration", "Indiranagar waste collection bay repair", "Outer Ring Road telecom duct repair"][i]!;
    const ward = demoWards.find((w) => w.id === [ids.wards.hsrLayout, ids.wards.btmLayout, ids.wards.indiranagar, ids.wards.bellandur][i])!;
    await prisma.project.create({ data: { id: workId(11 + i), agencyId, categoryId: [categories[10].id, categories[3].id, categories[4].id, telecomCategory][i], ownerProjectHeadId: projectHeadId, createdById: projectHeadId, engineerId, wardId: ward.id, origin: CivicWorkOrigin.AGENCY_PLANNED, state: ProjectState.READY_TO_START, title, locationLabel: `${ward.name}, Bengaluru`, workDescription: title, plannedStart: daysFromNow(4 + i), plannedEnd: daysFromNow(9 + i), createdAt: daysAgo(6) } });
    await prisma.$executeRaw`UPDATE "Project" SET "geometry" = ST_SetSRID(ST_MakePoint(${ward.representativeCoordinates.longitude},${ward.representativeCoordinates.latitude}),4326) WHERE "id" = ${workId(11 + i)}::uuid`;
  }
  await prisma.project.update({ where: { id: ids.plannedWorks.btmDrainage }, data: { agencyId: ids.agencies.drainage, ownerProjectHeadId: "40000000-0000-4000-8000-000000000112", createdById: "40000000-0000-4000-8000-000000000112", engineerId: "40000000-0000-4000-8000-000000000212" } });
  const work = [
    { n: 1, title: "Repair BTM bus-stop carriageway", engineerId: e1, state: ProjectState.ACTIVE, x: 77.609, y: 12.916 },
    { n: 2, title: "Restore Jayanagar pedestrian crossing", engineerId: e1, state: ProjectState.ACTIVE, x: 77.585, y: 12.931 },
    { n: 3, title: "Patch Koramangala service road", engineerId: e1, state: ProjectState.ACTIVE, x: 77.622, y: 12.935 },
    { n: 4, title: "Repair HSR Layout road shoulder", engineerId: e2, state: ProjectState.ACTIVE, x: 77.638, y: 12.912 },
    { n: 5, title: "Restore JP Nagar junction surface", engineerId: e3, state: ProjectState.ACTIVE, x: 77.588, y: 12.908 },
    { n: 6, title: "Review Jayanagar footpath restoration", engineerId: e3, state: ProjectState.AWAITING_VERIFICATION, x: 77.587, y: 12.930 },
    { n: 7, title: "Completed BTM school-zone road repair", engineerId: e2, state: ProjectState.CLOSED, x: 77.61, y: 12.915 },
    { n: 8, title: "Assign BTM lane resurfacing", engineerId: null, state: ProjectState.CREATED, x: 77.612, y: 12.917 },
  ];
  for (const item of work) {
    const finished = [ProjectState.CLOSED, ProjectState.AWAITING_VERIFICATION].includes(item.state as "CLOSED" | "AWAITING_VERIFICATION");
    const ticketId = `a2000000-0000-4000-8000-${String(item.n).padStart(12, "0")}`;
    const ticketState = finished ? item.state === ProjectState.CLOSED ? TicketState.CLOSED : TicketState.AWAITING_CITIZEN_VERIFICATION : item.state === ProjectState.CREATED ? TicketState.PROJECT_CREATED : TicketState.WORK_IN_PROGRESS;
    const ward = demoWards.find((w) => w.name.toLowerCase().includes(item.title.includes("Jayanagar") ? "jayanagar" : item.title.includes("HSR") ? "hsr" : item.title.includes("Koramangala") ? "koramangala" : item.title.includes("JP Nagar") ? "jp nagar" : "btm"))?.id ?? ids.wards.btmLayout;
    await prisma.$executeRaw`INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt") VALUES (${ticketId}::uuid, ${categories[0].id}::uuid, ${citizen}::uuid, ${ids.agencies.pwd}::uuid, ST_SetSRID(ST_MakePoint(${item.x}, ${item.y}),4326), ${ward}::uuid, ${ticketState}::"TicketState", ${item.title}, ${`${item.title}, Bengaluru`}, ${daysAgo(12)}, ${seedNow})`;
    await prisma.observation.create({ data: { ticketId, submitterId: citizen, imageUrl: "https://placehold.co/1200x800.jpg?text=Illustrative+site+evidence", note: "Road surface damage documented by a resident.", latitude: item.y, longitude: item.x, createdAt: daysAgo(12) } });
    await prisma.project.create({ data: { id: workId(item.n), ticketId, title: item.title, agencyId: ids.agencies.pwd, categoryId: categories[0].id, wardId: ward, ownerProjectHeadId: head, createdById: head, updatedById: head, engineerId: item.engineerId, origin: CivicWorkOrigin.CITIZEN_REPORTED, state: item.state, locationLabel: item.title.replace(/^(Repair|Restore|Patch|Review|Completed|Assign) /, "") + ", Bengaluru", workDescription: "Restore the inspected surface and reopen safe public access with photographic evidence.", plannedStart: daysAgo(5), plannedEnd: finished ? daysAgo(2) : daysFromNow(6), createdAt: daysAgo(9) } });
    await prisma.$executeRaw`UPDATE "Project" SET "geometry" = ST_SetSRID(ST_MakePoint(${item.x},${item.y}),4326) WHERE "id" = ${workId(item.n)}::uuid`;
    if (item.engineerId) {
      await prisma.inspectionReport.create({ data: { ticketId, assignedEngineerId: item.engineerId, assignedById: head, submittedById: item.engineerId, reviewedById: head, status: InspectionStatus.REVIEWED, deadline: daysAgo(9), createdAt: daysAgo(11), acceptedAt: daysAgo(11), startedAt: daysAgo(10), submittedAt: daysAgo(9), reviewedAt: daysAgo(9), observations: "Surface failure confirmed. Utility alignment and safe pedestrian access checked.", issueConfirmation: InspectionIssueConfirmation.CONFIRMED, severity: InspectionSeverity.MEDIUM, recommendedWork: "Restore damaged surface after utility clearance.", complexity: InspectionComplexity.MEDIUM, coordinationRequired: false, recommendation: InspectionRecommendation.PROCEED, latitude: item.y, longitude: item.x, locationConfirmedAt: daysAgo(10), reviewDecision: "CREATE_WORK" } });
      await prisma.projectWorkNote.create({ data: { projectId: workId(item.n), authorId: item.engineerId, note: finished ? "Restoration complete; public access reopened." : "Site protection installed. Work proceeding to the approved plan.", createdAt: daysAgo(finished ? 2 : 1) } });
    }
    if (finished && item.engineerId) {
      const evidence = await prisma.completionEvidence.create({ data: { projectId: workId(item.n), ticketId, submittedById: item.engineerId, photoUrl: "https://placehold.co/1200x800.jpg?text=Illustrative+restoration+evidence", objectKey: `demo/fresh/completion-${item.n}.jpg`, contentType: "image/jpeg", notes: "Demo evidence: restored pavement and reopened access.", createdAt: daysAgo(2), uploadedAt: daysAgo(2) } });
      await prisma.completionVerificationRequest.create({ data: { completionEvidenceId: evidence.id, citizenId: communityValidators[0]!.id, notifiedAt: daysAgo(2), respondedAt: item.state === ProjectState.CLOSED ? daysAgo(1) : null } });
      if (item.state === ProjectState.CLOSED) await prisma.completionVerification.create({ data: { completionEvidenceId: evidence.id, validatorId: communityValidators[0]!.id, decision: CompletionVerificationDecision.VERIFIED, note: "Public access is restored.", createdAt: daysAgo(1) } });
    }
  }
  // Intake and every inspection stage have independent real records.
  for (const [index, status] of [null, InspectionStatus.ASSIGNED, InspectionStatus.ACCEPTED, InspectionStatus.IN_PROGRESS, InspectionStatus.SUBMITTED].entries()) {
    const ticketId = `a3000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const state = !status ? TicketState.ROUTED_TO_AGENCY : status === InspectionStatus.SUBMITTED ? TicketState.INSPECTION_COMPLETE : TicketState.INSPECTION_DUE;
    const engineerId = index < 3 ? e1 : e3;
    await prisma.$executeRaw`INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt", "updatedAt") VALUES (${ticketId}::uuid, ${categories[0].id}::uuid, ${citizen}::uuid, ${ids.agencies.pwd}::uuid, ST_SetSRID(ST_MakePoint(77.61,12.915),4326), ${ids.wards.btmLayout}::uuid, ${state}::"TicketState", ${`BTM ${index + 1} Cross damaged road edge`}, 'BTM Layout, Bengaluru', ${daysAgo(2)}, ${seedNow})`;
    await prisma.observation.create({ data: { ticketId, submitterId: citizen, imageUrl: "https://placehold.co/1200x800.jpg?text=Illustrative+site+evidence", note: "Cracked road edge near the crossing.", createdAt: daysAgo(2) } });
    if (status) await prisma.inspectionReport.create({ data: { ticketId, assignedEngineerId: engineerId, assignedById: head, status, deadline: daysFromNow(2), createdAt: daysAgo(1), acceptedAt: status === InspectionStatus.ASSIGNED ? null : hoursAgo(18), startedAt: [InspectionStatus.IN_PROGRESS, InspectionStatus.SUBMITTED].includes(status as "IN_PROGRESS" | "SUBMITTED") ? hoursAgo(8) : null, submittedAt: status === InspectionStatus.SUBMITTED ? hoursAgo(2) : null, submittedById: status === InspectionStatus.SUBMITTED ? engineerId : null, observations: status === InspectionStatus.SUBMITTED ? "Road-edge settlement confirmed; localized repair recommended." : null, recommendation: status === InspectionStatus.SUBMITTED ? InspectionRecommendation.PROCEED : null } });
  }
  // Exactly one deliberately overdue dependency, with a grievance explaining it.
  const dependencySpecs = [
    { n: 1, projectId: workId(1), to: ids.agencies.bwssb, state: DependencyState.ASSIGNED, engineer: "40000000-0000-4000-8000-000000000202", deadline: daysFromNow(3) },
    { n: 2, projectId: workId(2), to: ids.agencies.bescom, state: DependencyState.PENDING_RESPONSE, engineer: null, deadline: daysFromNow(4) },
    { n: 3, projectId: workId(3), to: ids.agencies.traffic, state: DependencyState.ESCALATED, engineer: null, deadline: hoursAgo(6) },
    { n: 4, projectId: ids.phase4Coordination.resurfacingProject, to: ids.agencies.bwssb, state: DependencyState.FULFILLED, engineer: "40000000-0000-4000-8000-000000000202", deadline: daysAgo(1) },
  ];
  for (const d of dependencySpecs) {
    const id = `a4000000-0000-4000-8000-${String(d.n).padStart(12, "0")}`;
    await prisma.dependency.create({ data: { id, projectId: d.projectId, requestingAgencyId: ids.agencies.pwd, respondingAgencyId: d.to, assignedEngineerId: d.engineer, state: d.state, requirement: d.n === 4 ? "Complete pipeline excavation before road restoration." : "Confirm utility clearance and safe access before the next work stage.", deadline: d.deadline, createdAt: daysAgo(4), respondedAt: d.engineer ? daysAgo(3) : null, escalatedAt: d.state === DependencyState.ESCALATED ? hoursAgo(3) : null } });
  }
  await prisma.dependency.create({ data: { id: "a4000000-0000-4000-8000-000000000005", projectId: ids.plannedWorks.btmPipeline, requestingAgencyId: ids.agencies.bwssb, respondingAgencyId: ids.agencies.pwd, assignedEngineerId: e2, state: DependencyState.ASSIGNED, requirement: "Engineer 2 to inspect road reinstatement after water-main excavation.", deadline: daysFromNow(5), createdAt: daysAgo(2), respondedAt: daysAgo(1) } });
  await prisma.projectBlocker.create({ data: { projectId: workId(3), reportedById: e1, title: "Traffic diversion awaiting confirmation", details: "Intentionally overdue demo handoff; Project Head is coordinating safe access.", severity: "HIGH", createdAt: hoursAgo(5) } });
  const grievance = await prisma.grievance.create({ data: { ticketId: "a2000000-0000-4000-8000-000000000003", projectId: workId(3), dependencyId: "a4000000-0000-4000-8000-000000000003", raisedByUserId: citizen, responsibleUserId: head, responsibleAgencyId: ids.agencies.pwd, source: "CITIZEN", status: "UNDER_REVIEW", reason: "Access to the service road needs a confirmed diversion.", createdAt: hoursAgo(4) } });
  // Human-approved BTM sequence: the warning records the original overlap;
  // coordination entries and audit events explain the subsequent agreed schedule.
  const fixture = ids.phase4Coordination;
  const coordinated = await prisma.coordinationRequest.create({ data: { projectId: fixture.resurfacingProject, conflictingProjectId: fixture.pipelineProject, roadConflictLogId: fixture.conflict, dependencyId: "a4000000-0000-4000-8000-000000000004", requestingAgencyId: ids.agencies.pwd, respondingAgencyId: ids.agencies.bwssb, createdById: head, assignedEngineerId: "40000000-0000-4000-8000-000000000202", requestTypeKey: "schedule-coordination", subject: "BTM pipeline first, resurfacing after clearance", details: "Both agencies agreed the pipeline-first sequence after reviewing the road advisory.", status: "CLOSED", responseDeadline: daysAgo(1), sentAt: daysAgo(4), closedAt: hoursAgo(12), createdAt: daysAgo(4) } });
  for (const [index, status] of ["SENT", "ACKNOWLEDGED", "ACCEPTED", "COMPLETED", "CLOSED"].entries()) await prisma.coordinationEntry.create({ data: { requestId: coordinated.id, senderId: index === 0 || index === 4 ? head : "40000000-0000-4000-8000-000000000102", senderAgencyId: index === 0 || index === 4 ? ids.agencies.pwd : ids.agencies.bwssb, action: status, toStatus: status as "SENT" | "ACKNOWLEDGED" | "ACCEPTED" | "COMPLETED" | "CLOSED", message: status === "CLOSED" ? "Pipeline complete. Roads engineer agreed resurfacing from tomorrow." : "Pipeline-first sequence confirmed by the responsible agency.", createdAt: hoursAgo(96 - index * 21) } });
  await prisma.project.update({ where: { id: fixture.pipelineProject }, data: { state: ProjectState.COMPLETED, plannedStart: daysAgo(5), plannedEnd: daysAgo(1), actualStart: daysAgo(5), actualCompletion: daysAgo(1) } });
  await prisma.project.update({ where: { id: fixture.resurfacingProject }, data: { plannedStart: daysFromNow(1), plannedEnd: daysFromNow(7) } });
  for (const id of [fixture.pipelineProject, fixture.resurfacingProject]) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id } });
    await prisma.intervention.update({ where: { projectId: id }, data: { plannedStart: project.plannedStart!, plannedEnd: project.plannedEnd! } });
    await prisma.projectAuditEvent.create({ data: { projectId: id, actorId: id === fixture.pipelineProject ? "40000000-0000-4000-8000-000000000102" : head, action: "COORDINATED_SCHEDULE_UPDATED", metadata: { coordinationRequestId: coordinated.id, rule: "PIPELINE_BEFORE_RESURFACING", originalStart: daysFromNow(id === fixture.pipelineProject ? 3 : 6).toISOString(), originalEnd: daysFromNow(id === fixture.pipelineProject ? 10 : 13).toISOString(), newStart: project.plannedStart!.toISOString(), newEnd: project.plannedEnd!.toISOString() }, createdAt: hoursAgo(12) } });
  }
  const openConflict = await prisma.conflictLog.create({ data: { projectId: ids.plannedWorks.btmPipeline, conflictingProjectId: ids.plannedWorks.btmCable, projectAgencyId: ids.agencies.bwssb, conflictingAgencyId: ids.agencies.bescom, projectTimelineStart: daysFromNow(4), projectTimelineEnd: daysFromNow(14), conflictingTimelineStart: daysFromNow(9), conflictingTimelineEnd: daysFromNow(12), overlapStart: daysFromNow(9), overlapEnd: daysFromNow(12), locationDescription: "BTM 16th Main shared water and electricity corridor", distanceMeters: 0, severity: "PROMINENT", timelineFingerprint: "a".repeat(64), createdAt: hoursAgo(4) } });
  await prisma.coordinationRequest.create({ data: { projectId: ids.plannedWorks.btmPipeline, conflictingProjectId: ids.plannedWorks.btmCable, conflictLogId: openConflict.id, requestingAgencyId: ids.agencies.bwssb, respondingAgencyId: ids.agencies.bescom, createdById: "40000000-0000-4000-8000-000000000102", requestTypeKey: "schedule-coordination", subject: "Review BTM water-main and cable overlap", details: "Joint review needed before excavation; warning remains advisory.", status: "SENT", responseDeadline: daysFromNow(3), sentAt: hoursAgo(3), createdAt: hoursAgo(3) } });
  await prisma.notification.deleteMany();
  const events = [
    { userId: e1, type: "PROJECT_ASSIGNMENT", payload: { projectId: workId(1) } },
    { userId: e2, type: "PROJECT_ASSIGNMENT", payload: { projectId: workId(4) } },
    { userId: e3, type: "PROJECT_ASSIGNMENT", payload: { projectId: workId(5) } },
    { userId: e1, type: "INSPECTION_ASSIGNED", payload: { ticketId: "a3000000-0000-4000-8000-000000000002" } },
    { userId: head, type: "DEPENDENCY_ESCALATED", payload: { dependencyId: "a4000000-0000-4000-8000-000000000003", projectId: workId(3) } },
    { userId: head, type: "ROAD_CONFLICT_DETECTED", payload: { projectId: fixture.resurfacingProject, coordinationRequestId: coordinated.id } },
    { userId: "40000000-0000-4000-8000-000000000103", type: "CONFLICT_DETECTED", payload: { projectId: ids.plannedWorks.btmCable } },
    { userId: head, type: "GRIEVANCE_CREATED", payload: { grievanceId: grievance.id, ticketId: grievance.ticketId } },
    { userId: communityValidators[0]!.id, type: "COMPLETION_VERIFICATION_REQUEST", payload: { ticketId: "a2000000-0000-4000-8000-000000000006", projectId: workId(6) } },
    { userId: citizen, type: "WORK_COMPLETED", payload: { ticketId: "a2000000-0000-4000-8000-000000000007" } },
  ];
  for (const [index, event] of events.entries()) await prisma.notification.create({ data: { ...event, read: index % 3 === 0, createdAt: hoursAgo(index + 1) } });
}

async function reconcileDemoHistory(): Promise<void> {
  // Eliminate future actual starts from the older flagship fixture.
  const roadIds = [1, 2, 3].map((n) => `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  await prisma.project.updateMany({ where: { id: { in: roadIds } }, data: { state: ProjectState.READY_TO_START, actualStart: null } });
  await prisma.workflowAction.updateMany({ where: { projectId: { in: roadIds } }, data: { type: WorkflowActionType.START_WORK } });
  await prisma.project.update({ where: { id: "70000000-0000-4000-8000-000000000004" }, data: { engineerId: pwdDemoEngineers[1]!.id } });
  await prisma.workflowAction.updateMany({ where: { projectId: "70000000-0000-4000-8000-000000000004" }, data: { responsibleUserId: pwdDemoEngineers[1]!.id } });
  const states: ProjectState[] = ["CREATED", "PENDING_UPTAKE", "UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"];
  for (const project of await prisma.project.findMany()) {
    const index = states.indexOf(project.state);
    const started = index >= states.indexOf("ACTIVE");
    const completed = index >= states.indexOf("COMPLETED");
    const start = started ? project.plannedStart ?? daysAgo(5) : null;
    const end = completed ? project.plannedEnd ?? daysAgo(2) : null;
    const createdAt = project.createdAt > daysAgo(1) ? daysAgo(10) : project.createdAt;
    const lastVerification = await prisma.completionVerification.findFirst({ where: { completionEvidence: { projectId: project.id } }, orderBy: { createdAt: "desc" } });
    await prisma.project.update({ where: { id: project.id }, data: { createdAt, actualStart: start, actualCompletion: end } });
    await prisma.projectStateTransition.deleteMany({ where: { projectId: project.id } });
    const chain = states.slice(0, index + 1);
    for (const [i, state] of chain.entries()) {
      const at = state === "ACTIVE" ? start! : state === "COMPLETED" ? end! : state === "AWAITING_VERIFICATION" ? new Date(end!.getTime() + 3600000) : state === "CLOSED" ? new Date((lastVerification?.createdAt ?? end!).getTime() + 3600000) : new Date(createdAt.getTime() + i * 3600000);
      await prisma.projectStateTransition.create({ data: { projectId: project.id, fromState: chain[i - 1] ?? null, toState: state, reason: "DEMO_RECORDED_LIFECYCLE", actedById: state === "CLOSED" ? project.ownerProjectHeadId : i < 2 ? project.ownerProjectHeadId : project.engineerId ?? project.ownerProjectHeadId, createdAt: at } });
    }
    if (project.ticketId) {
      const ticketState = completed ? project.state === "CLOSED" ? TicketState.CLOSED : project.state === "AWAITING_VERIFICATION" ? TicketState.AWAITING_CITIZEN_VERIFICATION : TicketState.WORK_COMPLETED : started ? TicketState.WORK_IN_PROGRESS : project.engineerId ? TicketState.ENGINEER_ASSIGNED : TicketState.PROJECT_CREATED;
      await prisma.ticket.update({ where: { id: project.ticketId }, data: { state: ticketState, createdAt: new Date(createdAt.getTime() - 4 * 86400000) } });
      await prisma.inspectionReport.updateMany({ where: { ticketId: project.ticketId, status: InspectionStatus.REVIEWED }, data: { createdAt: new Date(createdAt.getTime() - 2 * 86400000), acceptedAt: new Date(createdAt.getTime() - 2 * 86400000 + 3600000), startedAt: new Date(createdAt.getTime() - 86400000), submittedAt: new Date(createdAt.getTime() - 7200000), reviewedAt: new Date(createdAt.getTime() - 3600000), deadline: createdAt } });
    }
  }
  for (const ticket of await prisma.ticket.findMany({ include: { project: { include: { stateTransitions: { orderBy: { createdAt: "asc" } } } }, inspectionReports: true } })) {
    await prisma.ticketStateTransition.deleteMany({ where: { ticketId: ticket.id } });
    const prefix: TicketState[] = [TicketState.DRAFT, TicketState.AI_CHECK_PENDING, TicketState.PENDING_VALIDATION, TicketState.VALIDATED, TicketState.ROUTED_TO_AGENCY];
    if (ticket.inspectionReports.length || ticket.project) prefix.push(TicketState.INSPECTION_DUE);
    if (ticket.inspectionReports.some((i) => [InspectionStatus.SUBMITTED, InspectionStatus.REVIEWED].includes(i.status as "SUBMITTED" | "REVIEWED")) || ticket.project) prefix.push(TicketState.INSPECTION_COMPLETE);
    const events = prefix.map((state, i) => ({ state, at: new Date(ticket.createdAt.getTime() + i * 3600000) }));
    const mapping: Partial<Record<ProjectState, TicketState>> = { CREATED: TicketState.PROJECT_CREATED, PENDING_UPTAKE: TicketState.ENGINEER_ASSIGNED, ACTIVE: TicketState.WORK_IN_PROGRESS, COMPLETED: TicketState.WORK_COMPLETED, AWAITING_VERIFICATION: TicketState.AWAITING_CITIZEN_VERIFICATION, CLOSED: TicketState.CLOSED };
    for (const t of ticket.project?.stateTransitions ?? []) if (mapping[t.toState]) events.push({ state: mapping[t.toState]!, at: t.createdAt });
    for (const [i, event] of events.entries()) await prisma.ticketStateTransition.create({ data: { ticketId: ticket.id, fromState: events[i - 1]?.state ?? null, toState: event.state, reason: "DEMO_RECORDED_LIFECYCLE", createdAt: event.at } });
  }
  for (const dependency of await prisma.dependency.findMany()) {
    await prisma.dependencyStateTransition.deleteMany({ where: { dependencyId: dependency.id } });
    const chain: DependencyState[] = [DependencyState.REQUESTED, DependencyState.PENDING_RESPONSE, ...(dependency.assignedEngineerId ? [DependencyState.ASSIGNED] : []), ...([DependencyState.REQUESTED, DependencyState.PENDING_RESPONSE, DependencyState.ASSIGNED].includes(dependency.state as "REQUESTED" | "PENDING_RESPONSE" | "ASSIGNED") ? [] : [dependency.state])];
    for (const [i, state] of chain.entries()) await prisma.dependencyStateTransition.create({ data: { dependencyId: dependency.id, fromState: chain[i - 1] ?? null, toState: state, reason: state === DependencyState.ESCALATED ? "INTENTIONAL_DEMO_OVERDUE" : "DEMO_AGENCY_HANDOFF", actedById: dependency.assignedEngineerId, createdAt: new Date(dependency.createdAt.getTime() + i * 3600000) } });
  }
}

// Controlled reference synchronization, independent of destructive showcase reset.
// Preserve existing credentials, phone verification, device location and work.
async function syncCampusDemo(): Promise<void> {
  const profile = process.env.DEPLOYMENT_PROFILE ?? (process.env.NODE_ENV === "production" ? "production" : "local");
  if (profile !== "local" && profile !== "free_demo") return;
  await prisma.$queryRaw`SELECT pg_advisory_xact_lock(7240912)::text`;
  const ward = demoWards.find(({ id }) => id === demoWardIds.jakkasandra)!;
  await prisma.$executeRaw`
    INSERT INTO "Ward" ("id", "name", "boundary")
    VALUES (${ward.id}::uuid, ${ward.name}, ST_GeomFromText(${demoWardBoundaryWkt(ward)},4326))
    ON CONFLICT ("id") DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType")
    VALUES ('80000000-0000-4000-8000-000000000011', 'JAIN campus access road (demo segment)',
      ST_GeomFromText('LINESTRING(77.4395 12.63865,77.4435 12.63865)',4326), ${ward.id}::uuid, 'Asphalt')
    ON CONFLICT ("id") DO NOTHING
  `;
  const passwordHash = await bcrypt.hash(demoInternalPassword, 12);
  for (let number = 1; number <= 5; number += 1) {
    const id = `42000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
    const email = `citizen.jain.${number}@cityconnect.local`;
    const phone = `+91987652000${number}`;
    const latitude = 12.63865 + (number - 1) * 0.00015;
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "role", "email", "phone", "passwordHash", "phoneVerifiedAt", "wardId", "lastKnownCoordinates")
      VALUES (${id}::uuid, 'CITIZEN', ${email}, ${phone}, ${passwordHash}, NOW(), ${ward.id}::uuid,
        ST_SetSRID(ST_MakePoint(77.44137, ${latitude}),4326)) ON CONFLICT DO NOTHING
    `;
  }
  const marker = await prisma.systemConfig.findUnique({ where: { key: "demo.jain_reference_version" } });
  if (!marker) {
    for (const config of [
      { key: "demo.web_auto_route_enabled", value: false, description: "Community validation precedes routing in the campus demo" },
      { key: "demo.workflow_defaults_enabled", value: true, description: "Optional form defaults, allowed only in local/free_demo profiles" },
      { key: "verification.quorum", value: 1, description: "Independent confirmations required in the campus demo" },
      { key: "verification.initial_recipient_count", value: 15, description: "Nearest eligible citizens invited to community review" },
      { key: "demo.jain_reference_version", value: 1, description: "Additive campus demo provisioning version" },
    ]) await prisma.systemConfig.upsert({ where: { key: config.key }, create: config, update: { value: config.value } });
  }
}

async function main(): Promise<void> {
  if (demoSeedMode === "if_empty") {
    const occupied = await client.user.count() + await client.agency.count() + await client.ticket.count() + await client.project.count();
    if (occupied) {
      await client.$transaction(async (transaction) => { prisma = transaction; await syncCampusDemo(); }, { timeout: 30000 });
      console.log("Application seed skipped; additive campus demo reference data synchronized. Existing work preserved.");
      return;
    }
  }
  const target = assertDemoResetAllowed(process.env);
  console.warn(`DEMO RESET: replacing all application records in ${target}; schema, migrations, configuration and reference counters are preserved.`);
  await client.$transaction(async (transaction) => {
    prisma = transaction;
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(7240911)::text`;
    if (demoSeedMode === "team_only") { await seedPwdDemoEngineers(await bcrypt.hash(demoInternalPassword, 12)); return; }
    await clearDemoDatabase(transaction);
    await seedDataset();
    await syncCampusDemo();
  }, { timeout: 120000, maxWait: 10000 });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.$disconnect();
  });
