import {
  CompletionVerificationDecision,
  DependencyState,
  Prisma,
  PrismaClient,
  ProjectState,
  TicketState,
  UserRole,
  ValidationVote,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const demoInternalPassword = process.env.DEMO_INTERNAL_PASSWORD ?? "CivicOS@123";

if (process.env.NODE_ENV === "production" && demoInternalPassword === "CivicOS@123") {
  throw new Error("DEMO_INTERNAL_PASSWORD must replace the local demo password in production");
}

const ids = {
  wards: {
    koramangala: "10000000-0000-4000-8000-000000000001",
    indiranagar: "10000000-0000-4000-8000-000000000002",
    hsrLayout: "10000000-0000-4000-8000-000000000003",
    jayanagar: "10000000-0000-4000-8000-000000000004",
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
} as const;

const wards = [
  {
    id: ids.wards.koramangala,
    name: "Koramangala",
    boundary: "POLYGON((77.6100 12.9250,77.6350 12.9250,77.6350 12.9500,77.6100 12.9500,77.6100 12.9250))",
  },
  {
    id: ids.wards.indiranagar,
    name: "Indiranagar",
    boundary: "POLYGON((77.6250 12.9650,77.6550 12.9650,77.6550 12.9900,77.6250 12.9900,77.6250 12.9650))",
  },
  {
    id: ids.wards.hsrLayout,
    name: "HSR Layout",
    boundary: "POLYGON((77.6250 12.8950,77.6550 12.8950,77.6550 12.9250,77.6250 12.9250,77.6250 12.8950))",
  },
  {
    id: ids.wards.jayanagar,
    name: "Jayanagar",
    boundary: "POLYGON((77.5650 12.9150,77.6000 12.9150,77.6000 12.9450,77.5650 12.9450,77.5650 12.9150))",
  },
] as const;

const agencies = [
  { id: ids.agencies.bwssb, name: "BWSSB", type: "Water Board" },
  { id: ids.agencies.bescom, name: "BESCOM", type: "Electrical/Power" },
  { id: ids.agencies.pwd, name: "PWD / Roads Authority", type: "Roads/PWD" },
  { id: ids.agencies.waste, name: "Municipal Waste Management", type: "Solid Waste" },
  { id: ids.agencies.traffic, name: "Bengaluru Traffic Police", type: "Traffic" },
  { id: ids.agencies.planning, name: "Town Planning Department", type: "Town Planning" },
  { id: ids.agencies.parks, name: "BBMP Parks & Horticulture", type: "Parks and Urban Forestry" },
  { id: ids.agencies.animalHusbandry, name: "BBMP Animal Husbandry", type: "Animal Welfare" },
  { id: ids.agencies.publicAmenities, name: "BBMP Public Amenities", type: "Public Amenities" },
] as const;

const categories = [
  { id: "30000000-0000-4000-8000-000000000001", name: "Road Damage", primaryAgencyId: ids.agencies.pwd },
  { id: "30000000-0000-4000-8000-000000000002", name: "Streetlight", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000003", name: "Water Supply", primaryAgencyId: ids.agencies.bwssb },
  { id: "30000000-0000-4000-8000-000000000004", name: "Drainage/Sewage", primaryAgencyId: ids.agencies.bwssb },
  { id: "30000000-0000-4000-8000-000000000005", name: "Garbage/Waste", primaryAgencyId: ids.agencies.waste },
  { id: "30000000-0000-4000-8000-000000000006", name: "Electrical Hazard", primaryAgencyId: ids.agencies.bescom },
  { id: "30000000-0000-4000-8000-000000000007", name: "Public Toilet", primaryAgencyId: ids.agencies.publicAmenities },
  { id: "30000000-0000-4000-8000-000000000008", name: "Parks & Trees", primaryAgencyId: ids.agencies.parks },
  { id: "30000000-0000-4000-8000-000000000009", name: "Stray Animals", primaryAgencyId: ids.agencies.animalHusbandry },
  { id: "30000000-0000-4000-8000-000000000010", name: "Illegal Construction", primaryAgencyId: ids.agencies.planning },
  { id: "30000000-0000-4000-8000-000000000011", name: "Traffic & Signage", primaryAgencyId: ids.agencies.traffic },
  { id: "30000000-0000-4000-8000-000000000012", name: "Other", primaryAgencyId: ids.agencies.publicAmenities },
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

const adminConfigs = [
  { key: "auth.otp_max_attempts", value: 5, description: "Maximum failed verification attempts for one OTP challenge" },
  // Delta §6 — inputs for the explicitly simulated restoration-savings formula.
  { key: "road.simulated_restoration_cost_per_meter", value: 1800, description: "Illustrative road restoration cost per affected metre in INR; never presented as measured" },
  { key: "road.simulated_avoided_rework_factor", value: 0.65, description: "Illustrative fraction of restoration work assumed avoided after an accepted sequencing recommendation" },
  { key: "verification.default_radius_meters", value: 500, description: "Default citizen verification radius when a ward override is absent" },
  { key: "verification.daily_cap", value: 10, description: "Maximum validations a citizen may submit per day" },
  { key: "verification.quorum", value: 3, description: "Independent confirmations required to validate a ticket" },
  { key: "verification.initial_recipient_count", value: 15, description: "Nearest eligible citizens notified for a validation batch" },
  { key: "verification.renotify_after_hours", value: 72, description: "Hours before an incomplete validation batch is sent again" },
  { key: "duplicate.radius_meters", value: 75, description: "Geographic radius used by shared-ticket detection" },
  { key: "duplicate.open_window_days", value: 60, description: "Age window used by shared-ticket detection" },
  { key: "duplicate.visual_similarity_threshold", value: 0.75, description: "Advisory CLIP embedding similarity threshold" },
  { key: "ai_relevance.max_retries", value: 3, description: "Maximum relevance-check retries before manual-review recommendation" },
  { key: "ai_relevance.pass_threshold", value: 0.6, description: "Minimum hosted image/category relevance confidence" },
  { key: "conflict.radius_meters", value: 200, description: "Default generic project conflict radius" },
  { key: "road.category_id", value: categories[0].id, description: "Admin-configured category that enables Road-Cutting Intelligence" },
  { key: "road.repeated_excavation_days", value: 90, description: "Days after restoration during which a new excavation receives an advisory warning" },
] as const;

// Part III §9.3 — deterministic, progressively farther Koramangala citizens
// power the nearest-15 and stale-batch demo/acceptance flow.
const communityValidators = Array.from({ length: 30 }, (_unused, index) => ({
  id: `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  role: UserRole.CITIZEN,
  phone: `+91987651${String(index + 1).padStart(4, "0")}`,
  wardId: ids.wards.koramangala,
  phoneVerifiedAt: new Date(),
  latitude: 12.935 + (index + 1) * 0.0001,
  longitude: 77.62,
}));

const engineerDemoProjects = [
  { suffix: "01", title: "Repair failed carriageway near Koramangala 5th Block", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.ENGINEER_ASSIGNED, projectState: ProjectState.PENDING_UPTAKE, wardId: ids.wards.koramangala, categoryId: categories[0].id, longitude: 77.6212, latitude: 12.9348, start: null, end: null },
  { suffix: "02", title: "Restore damaged road shoulder on 80 Feet Road", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.WORK_IN_PROGRESS, projectState: ProjectState.ACTIVE, wardId: ids.wards.koramangala, categoryId: categories[0].id, longitude: 77.6241, latitude: 12.9361, start: new Date("2026-08-20T00:00:00.000Z"), end: new Date("2026-09-03T23:59:59.999Z") },
  { suffix: "03", title: "Replace leaking distribution valve in HSR Layout", agencyId: ids.agencies.bwssb, engineerId: "40000000-0000-4000-8000-000000000202", ticketState: TicketState.WORK_IN_PROGRESS, projectState: ProjectState.ACTIVE, wardId: ids.wards.hsrLayout, categoryId: categories[2].id, longitude: 77.6389, latitude: 12.9116, start: new Date("2026-08-22T00:00:00.000Z"), end: new Date("2026-09-08T23:59:59.999Z") },
  { suffix: "04", title: "Complete pothole patching near Forum junction", agencyId: ids.agencies.pwd, engineerId: "40000000-0000-4000-8000-000000000201", ticketState: TicketState.WORK_COMPLETED, projectState: ProjectState.COMPLETED, wardId: ids.wards.koramangala, categoryId: categories[0].id, longitude: 77.6118, latitude: 12.9342, start: new Date("2026-08-15T00:00:00.000Z"), end: new Date("2026-08-22T23:59:59.999Z") },
] as const;

async function seedWards(): Promise<void> {
  for (const ward of wards) {
    await prisma.$executeRaw`
      INSERT INTO "Ward" ("id", "name", "boundary", "verificationRadiusOverrideMeters")
      VALUES (${ward.id}::uuid, ${ward.name}, ST_GeomFromText(${ward.boundary}, 4326), NULL)
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
      INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "createdAt")
      VALUES (${ticketId}::uuid, ${item.categoryId}::uuid, ${"40000000-0000-4000-8000-000000000001"}::uuid,
        ${item.agencyId}::uuid, ST_SetSRID(ST_MakePoint(${item.longitude}, ${item.latitude}), 4326), ${item.wardId}::uuid,
        ${item.ticketState}::"TicketState", ${item.title}, ${`${item.title}, Bengaluru`}, NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "assignedAgencyId" = EXCLUDED."assignedAgencyId", "coordinates" = EXCLUDED."coordinates", "state" = EXCLUDED."state",
        "title" = EXCLUDED."title", "address" = EXCLUDED."address"
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
      create: { ticketId, submittedById: item.agencyId === ids.agencies.pwd ? "40000000-0000-4000-8000-000000000101" : "40000000-0000-4000-8000-000000000102", fileUrl: `https://images.civicos.local/demo/${item.suffix}-inspection.pdf`, objectKey: `demo/engineer/${item.suffix}-inspection.pdf`, contentType: "application/pdf", notes: "Site inspected; execution scope and safety controls confirmed.", uploadedAt: new Date() },
    });
    await prisma.project.upsert({
      where: { id: projectId },
      update: { agencyId: item.agencyId, engineerId: item.engineerId, state: item.projectState, plannedStart: item.start, plannedEnd: item.end, workDescription: item.start ? "Execute the inspected scope with field safety controls and restore the public area." : null, dependencyFlags: item.agencyId === ids.agencies.pwd ? ["Traffic coordination"] : ["Road restoration coordination"] },
      create: { id: projectId, ticketId, agencyId: item.agencyId, engineerId: item.engineerId, state: item.projectState, plannedStart: item.start, plannedEnd: item.end, workDescription: item.start ? "Execute the inspected scope with field safety controls and restore the public area." : null, dependencyFlags: item.agencyId === ids.agencies.pwd ? ["Traffic coordination"] : ["Road restoration coordination"] },
    });
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
    INSERT INTO "Ticket" ("id", "categoryId", "reporterId", "assignedAgencyId", "coordinates", "wardId", "state", "title", "address", "aiRetryCount", "createdAt")
    VALUES (${demo.ticket}::uuid, ${categories[1].id}::uuid, ${reporterId}::uuid, ${ids.agencies.bescom}::uuid,
      ST_SetSRID(ST_MakePoint(77.6408, 12.9784), 4326), ${ids.wards.indiranagar}::uuid,
      ${TicketState.CLOSED}::"TicketState", 'Streetlight outage outside Indiranagar Metro',
      'CMH Road, near Indiranagar Metro Station, Bengaluru', 1, ${at(1)})
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
      imageUrl: `${evidenceBaseUrl}?text=Streetlight+outage+CMH+Road`,
      note: "Two consecutive streetlights are dark beside the metro exit, making the footpath unsafe after dusk.",
      latitude: 12.9784,
      longitude: 77.6408,
      address: "CMH Road, near Indiranagar Metro Station, Bengaluru",
      createdAt: at(1),
    },
    create: {
      id: demo.observation,
      ticketId: demo.ticket,
      submitterId: reporterId,
      imageUrl: `${evidenceBaseUrl}?text=Streetlight+outage+CMH+Road`,
      note: "Two consecutive streetlights are dark beside the metro exit, making the footpath unsafe after dusk.",
      latitude: 12.9784,
      longitude: 77.6408,
      address: "CMH Road, near Indiranagar Metro Station, Bengaluru",
      createdAt: at(1),
    },
  });
  await prisma.image.upsert({
    where: { id: demo.image },
    update: {
      observationId: demo.observation,
      url: `${evidenceBaseUrl}?text=Streetlight+outage+CMH+Road`,
      objectKey: "demo/general/streetlight-outage.jpg",
      isPrimary: true,
      aiRelevanceScore: 0.94,
      uploadedAt: at(1),
      createdAt: at(1),
    },
    create: {
      id: demo.image,
      observationId: demo.observation,
      url: `${evidenceBaseUrl}?text=Streetlight+outage+CMH+Road`,
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
      submittedById: projectHeadId,
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
      submittedById: projectHeadId,
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
      agencyId: ids.agencies.bescom,
      engineerId,
      state: ProjectState.CLOSED,
      plannedStart: at(7),
      plannedEnd: at(9, 12),
      workDescription: "Isolate the feeder, replace both LED luminaires and junction components, then test illumination after dusk.",
      dependencyFlags: ["Traffic-side access support"],
      createdAt: at(5),
    },
  });
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
  const projectStates = [ProjectState.CREATED, ProjectState.PENDING_UPTAKE, ProjectState.UPTAKEN, ProjectState.TIMELINE_SET, ProjectState.ACTIVE, ProjectState.COMPLETED, ProjectState.AWAITING_VERIFICATION, ProjectState.CLOSED];
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
    VALUES (${ids.roadSegments.flagship}::uuid, 'Segment X · 80 Feet Road',
      ST_GeomFromText('LINESTRING(77.6205 12.9340,77.6250 12.9360)', 4326),
      ${ids.wards.koramangala}::uuid, 'Asphalt', ${new Date("2027-04-01T00:00:00.000Z")})
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
      INSERT INTO "Ticket" ("id", "categoryId", "assignedAgencyId", "coordinates", "wardId", "roadSegmentId", "state", "title", "address", "createdAt")
      VALUES (${ticketId}::uuid, ${categories[0].id}::uuid, ${item.agencyId}::uuid,
        ST_SetSRID(ST_MakePoint(77.6225, 12.9350), 4326), ${ids.wards.koramangala}::uuid,
        ${ids.roadSegments.flagship}::uuid, ${TicketState.WORK_IN_PROGRESS}::"TicketState", ${item.title}, '80 Feet Road, Koramangala, Bengaluru', NOW())
      ON CONFLICT ("id") DO UPDATE SET "assignedAgencyId" = EXCLUDED."assignedAgencyId", "roadSegmentId" = EXCLUDED."roadSegmentId",
        "state" = EXCLUDED."state", "title" = EXCLUDED."title"
    `;
    await prisma.project.upsert({
      where: { id: projectId },
      update: { agencyId: item.agencyId, engineerId: item.engineerId, state: ProjectState.ACTIVE, plannedStart: item.start, plannedEnd: item.end, workDescription: item.title },
      create: { id: projectId, ticketId, agencyId: item.agencyId, engineerId: item.engineerId, state: ProjectState.ACTIVE, plannedStart: item.start, plannedEnd: item.end, workDescription: item.title },
    });
    await prisma.intervention.upsert({
      where: { projectId },
      update: { segmentId: ids.roadSegments.flagship, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, startOffsetM: item.offset, affectedLengthM: item.length, dependencyRefs: [...item.refs] },
      create: { id: interventionId, projectId, segmentId: ids.roadSegments.flagship, requestingAgencyId: item.agencyId, purpose: item.purpose, plannedStart: item.start, plannedEnd: item.end, startOffsetM: item.offset, affectedLengthM: item.length, dependencyRefs: [...item.refs] },
    });
  }
}

async function main(): Promise<void> {
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
      update: { name: category.name, primaryAgencyId: category.primaryAgencyId, adminEditable: true },
      create: { ...category, adminEditable: true },
    });
  }

  await prisma.routingRule.deleteMany();
  await prisma.routingRule.createMany({
    data: routingRules.map(([categoryId, dependencyAgencyId]) => ({
      categoryId,
      dependencyAgencyId,
    })),
  });

  for (const config of adminConfigs) {
    await prisma.adminConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: { key: config.key, value: config.value, description: config.description },
    });
  }

  const passwordHash = await bcrypt.hash(demoInternalPassword, 12);
  const users: Array<Prisma.UserUncheckedCreateInput & { latitude?: number; longitude?: number }> = [
    { id: "40000000-0000-4000-8000-000000000001", role: UserRole.CITIZEN, phone: "+919876500001", wardId: ids.wards.koramangala, phoneVerifiedAt: new Date(), latitude: 12.935, longitude: 77.62 },
    { id: "40000000-0000-4000-8000-000000000002", role: UserRole.CITIZEN, phone: "+919876500002", wardId: ids.wards.indiranagar, phoneVerifiedAt: new Date(), latitude: 12.9784, longitude: 77.6408 },
    { id: "40000000-0000-4000-8000-000000000003", role: UserRole.CITIZEN, phone: "+919876500003", wardId: ids.wards.hsrLayout, phoneVerifiedAt: new Date(), latitude: 12.9116, longitude: 77.6389 },
    ...communityValidators,
    { id: "40000000-0000-4000-8000-000000000101", role: UserRole.PROJECT_HEAD, email: "head.pwd@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000102", role: UserRole.PROJECT_HEAD, email: "head.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000103", role: UserRole.PROJECT_HEAD, email: "head.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000201", role: UserRole.ENGINEER, email: "engineer.pwd@civicos.local", agencyId: ids.agencies.pwd, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000202", role: UserRole.ENGINEER, email: "engineer.bwssb@civicos.local", agencyId: ids.agencies.bwssb, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000203", role: UserRole.ENGINEER, email: "engineer.bescom@civicos.local", agencyId: ids.agencies.bescom, passwordHash, mustResetPassword: false },
    { id: "40000000-0000-4000-8000-000000000301", role: UserRole.ADMIN, email: "admin@civicos.local", passwordHash, mustResetPassword: false, totpEnabled: false },
    { id: "40000000-0000-4000-8000-000000000302", role: UserRole.ADMIN, email: "admin.ops@civicos.local", passwordHash, mustResetPassword: true, totpEnabled: false },
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

  console.log(`Seeded ${wards.length} wards, ${agencies.length} agencies, ${categories.length} categories, and ${users.length} users.`);
  console.log(`Seeded ${engineerDemoProjects.length} Executive Engineer demo projects.`);
  console.log("Seeded the Part I §31 closed streetlight lifecycle with validation, dependency, execution, and citizen verification history.");
  console.log("Seeded Segment X flagship road-cutting scenario (PWD, BWSSB, BESCOM).");
  console.log(process.env.NODE_ENV === "production"
    ? "Internal demo-user password loaded from DEMO_INTERNAL_PASSWORD."
    : "Local internal-user password: CivicOS@123");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
