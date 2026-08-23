import { Prisma, PrismaClient, ProjectState, TicketState, UserRole, ValidationVote } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

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

  const passwordHash = await bcrypt.hash("CivicOS@123", 12);
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

  console.log(`Seeded ${wards.length} wards, ${agencies.length} agencies, ${categories.length} categories, and ${users.length} users.`);
  console.log(`Seeded ${engineerDemoProjects.length} Executive Engineer demo projects.`);
  console.log("Local internal-user password: CivicOS@123");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
