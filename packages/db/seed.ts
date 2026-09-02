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

const prisma = new PrismaClient();
const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";
const demoSeedMode = process.env.DEMO_SEED_MODE ?? "reset";

if (demoSeedMode !== "reset" && demoSeedMode !== "if_empty") {
  throw new Error("DEMO_SEED_MODE must be reset or if_empty");
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
    planning: "20000000-0000-4000-8000-000000000006",
    parks: "20000000-0000-4000-8000-000000000007",
    animalHusbandry: "20000000-0000-4000-8000-000000000008",
    publicAmenities: "20000000-0000-4000-8000-000000000009",
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
  { id: ids.agencies.planning, name: "Town Planning Department", type: "Town Planning" },
  { id: ids.agencies.parks, name: "BBMP Parks & Horticulture", type: "Parks and Urban Forestry" },
  { id: ids.agencies.animalHusbandry, name: "BBMP Animal Husbandry", type: "Animal Welfare" },
  { id: ids.agencies.publicAmenities, name: "BBMP Public Amenities", type: "Public Amenities" },
] as const;

const categories = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Road Damage", relevancePrompt: "a pothole, damaged road, cracked pavement, or broken asphalt", primaryAgencyId: ids.agencies.pwd },
  { id: "30000000-0000-4000-8000-000000000002", name: "Streetlight", relevancePrompt: "a damaged, broken, leaning, or non-working street light", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000003", name: "Water Supply", relevancePrompt: "water leakage, a broken water pipe, flooding, or standing water", primaryAgencyId: ids.agencies.bwssb },
  { id: "30000000-0000-4000-8000-000000000004", name: "Drainage/Sewage", relevancePrompt: "an overflowing drain, blocked storm drain, open sewer, or sewage spill", primaryAgencyId: ids.agencies.bwssb },
  { id: "30000000-0000-4000-8000-000000000005", name: "Garbage/Waste", relevancePrompt: "dumped garbage, litter, an overflowing trash bin, or solid waste", primaryAgencyId: ids.agencies.waste },
  { id: "30000000-0000-4000-8000-000000000006", name: "Electrical Hazard", relevancePrompt: "exposed electrical wires, a fallen power line, sparking equipment, or an electrical hazard", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000007", name: "Public Toilet", relevancePrompt: "a damaged, dirty, blocked, or unusable public toilet", primaryAgencyId: ids.agencies.publicAmenities },
  { id: "30000000-0000-4000-8000-000000000008", name: "Parks & Trees", relevancePrompt: "a fallen or hazardous tree, damaged park equipment, or neglected public park", primaryAgencyId: ids.agencies.parks },
  { id: "30000000-0000-4000-8000-000000000009", name: "Stray Animals", relevancePrompt: "stray dogs, cattle, or other unattended animals in a public place", primaryAgencyId: ids.agencies.animalHusbandry },
  { id: "30000000-0000-4000-8000-000000000010", name: "Illegal Construction", relevancePrompt: "unauthorized construction, building work obstructing a public area, or construction debris", primaryAgencyId: ids.agencies.planning },
  { id: "30000000-0000-4000-8000-000000000011", name: "Traffic & Signage", relevancePrompt: "a damaged traffic sign, broken signal, missing road sign, or traffic obstruction", primaryAgencyId: ids.agencies.traffic },
  { id: "30000000-0000-4000-8000-000000000012", name: "Other", relevancePrompt: "a visible civic infrastructure problem in a public place", primaryAgencyId: ids.agencies.publicAmenities },
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
  { key: "demo.web_auto_route_enabled", value: true, description: "Demo-only: route relevant web reports directly to the category's configured primary agency" },
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
  { suffix: "04", title: "Complete pothole patching near South End Circle", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.WORK_COMPLETED, projectState: ProjectState.COMPLETED, wardId: ids.wards.jayanagar, categoryId: categories[0].id, longitude: 77.5802, latitude: 12.9367, start: new Date("2026-08-15T00:00:00.000Z"), end: new Date("2026-08-22T23:59:59.999Z") },
] as const;

const retiredEngineerDemoSuffixes = ["02", "03"] as const;

async function cleanupRetiredDemoFixtures(): Promise<void> {
  const projectIds = retiredEngineerDemoSuffixes.map((suffix) => `70000000-0000-4000-8000-${suffix.padStart(12, "0")}`);
  const ticketIds = retiredEngineerDemoSuffixes.map((suffix) => `50000000-0000-4000-8000-${suffix.padStart(12, "0")}`);
  // Exact deterministic fixture IDs only; runtime and user-created records are never matched.
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
}

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
  const at = (day: number, hour = 4) => new Date(Date.UTC(2026, 6, day, hour));
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
      ${ids.wards.jayanagar}::uuid, 'Asphalt', ${new Date("2027-04-01T00:00:00.000Z")})
    ON CONFLICT ("id") DO UPDATE SET "roadName" = EXCLUDED."roadName", "geometry" = EXCLUDED."geometry",
      "wardId" = EXCLUDED."wardId", "surfaceType" = EXCLUDED."surfaceType", "lastRestorationDate" = EXCLUDED."lastRestorationDate"
  `;

  const work = [
    { suffix: "01", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", title: "Planned resurfacing on Segment X", purpose: "resurfacing", start: new Date("2027-06-20T00:00:00.000Z"), end: new Date("2027-06-24T23:59:59.999Z"), offset: 0, length: 420, refs: [] as string[] },
    { suffix: "02", agencyId: ids.agencies.bwssb, engineerId: "40000000-0000-4000-8000-000000000202", title: "BWSSB pipeline intervention on Segment X", purpose: "pipeline", start: new Date("2027-06-10T00:00:00.000Z"), end: new Date("2027-06-16T23:59:59.999Z"), offset: 20, length: 260, refs: [] as string[] },
    { suffix: "03", agencyId: ids.agencies.bescom, engineerId: "40000000-0000-4000-8000-000000000203", title: "BESCOM cable intervention on Segment X", purpose: "cable", start: new Date("2027-06-15T00:00:00.000Z"), end: new Date("2027-06-18T23:59:59.999Z"), offset: 100, length: 180, refs: ["83000000-0000-4000-8000-000000000002"] },
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
      start: new Date("2026-11-08T03:30:00.000Z"),
      end: new Date("2026-11-15T12:30:00.000Z"),
    },
    {
      id: fixture.pipelineProject,
      interventionId: fixture.pipelineIntervention,
      agencyId: ids.agencies.bwssb,
      ownerId: "40000000-0000-4000-8000-000000000102",
      engineerId: "40000000-0000-4000-8000-000000000202",
      title: "BWSSB pipeline replacement · BTM 16th Main",
      purpose: "pipeline",
      start: new Date("2026-11-05T03:30:00.000Z"),
      end: new Date("2026-11-12T12:30:00.000Z"),
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
      start: new Date("2026-10-12T03:30:00.000Z"),
      end: new Date("2026-10-22T12:30:00.000Z"),
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
      start: new Date("2026-10-17T03:30:00.000Z"),
      end: new Date("2026-10-20T12:30:00.000Z"),
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
      start: new Date("2026-11-02T03:30:00.000Z"),
      end: new Date("2026-11-06T12:30:00.000Z"),
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

async function main(): Promise<void> {
  // Ward defaults must still be reconciled when startup seeding skips the
  // destructive demo-fixture reset on an already populated database.
  await seedWards();
  if (demoSeedMode === "if_empty") {
    const [generalTicket, flagshipSegment] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ids.generalDemo.ticket }, select: { id: true } }),
      prisma.roadSegment.findUnique({ where: { id: ids.roadSegments.flagship }, select: { id: true } }),
    ]);
    if (generalTicket && flagshipSegment) {
      console.log("Demo fixtures already exist; skipping startup seed. Run db:seed without DEMO_SEED_MODE to reset the rehearsal state.");
      return;
    }
  }
  await cleanupRetiredDemoFixtures();

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
    { id: "40000000-0000-4000-8000-000000000101", role: UserRole.PROJECT_HEAD, email: "head.pwd@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000102", role: UserRole.PROJECT_HEAD, email: "head.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000103", role: UserRole.PROJECT_HEAD, email: "head.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000104", role: UserRole.PROJECT_HEAD, email: "head.bbmp@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000201", role: UserRole.ENGINEER, email: "engineer.pwd@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000202", role: UserRole.ENGINEER, email: "engineer.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000203", role: UserRole.ENGINEER, email: "engineer.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000204", role: UserRole.ENGINEER, email: "engineer.bbmp@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
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

  await seedEngineerWorkflowDemo();
  await seedGeneralEndToEndDemo();
  await seedRoadCuttingDemo();
  await seedPhase4CoordinationDemo();
  await seedPlannedCivicWorks();

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

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
