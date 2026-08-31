import assert from "node:assert/strict";
import { ProjectState, RoadConflictType, TicketState, prisma } from "db";
import { checkRoadConflicts, recommendationsForSegment } from "../src/road-intelligence/service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";

const generalTicketId = "90000000-0000-4000-8000-000000000001";
const generalProjectId = "90000000-0000-4000-8000-000000000005";
const flagshipSegmentId = "80000000-0000-4000-8000-000000000001";
const resurfacingProjectId = "82000000-0000-4000-8000-000000000001";
const flagshipProjectIds = [
  resurfacingProjectId,
  "82000000-0000-4000-8000-000000000002",
  "82000000-0000-4000-8000-000000000003",
];

async function main(): Promise<void> {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: generalTicketId },
    include: {
      category: true,
      validations: true,
      validationRequests: true,
      inspectionReports: true,
      stateTransitions: true,
      observations: { include: { images: true } },
    },
  });
  assert.equal(ticket.category.name, "Streetlight");
  assert.equal(ticket.roadSegmentId, null);
  assert.equal(ticket.state, TicketState.CLOSED);
  assert.equal(ticket.validations.length, 3);
  assert.equal(ticket.validationRequests.filter(({ respondedAt }) => respondedAt !== null).length, 3);
  assert.equal(ticket.inspectionReports.length, 1);
  assert.equal(ticket.observations.length, 1);
  assert.equal(ticket.observations[0]?.images.length, 1);
  assert.equal(ticket.stateTransitions.length, 13);

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: generalProjectId },
    include: {
      dependencies: { include: { stateTransitions: true } },
      stateTransitions: true,
      workNotes: true,
      completionEvidence: { include: { verificationRequests: true, verifications: true } },
    },
  });
  assert.equal(project.state, ProjectState.CLOSED);
  assert.equal(project.dependencies.length, 1);
  assert.equal(project.dependencies[0]?.state, "FULFILLED");
  assert.equal(project.dependencies[0]?.stateTransitions.length, 3);
  assert.equal(project.stateTransitions.length, 8);
  assert.equal(project.workNotes.length, 1);
  assert.equal(project.completionEvidence[0]?.verificationRequests.length, 3);
  assert.equal(project.completionEvidence[0]?.verifications.length, 3);

  const segment = await prisma.roadSegment.findUniqueOrThrow({
    where: { id: flagshipSegmentId },
    include: { interventions: { include: { requestingAgency: true }, orderBy: { plannedStart: "asc" } } },
  });
  assert.equal(segment.roadName, "Segment X · 11th Main Road");
  assert.deepEqual(segment.interventions.filter(({ projectId }) => flagshipProjectIds.includes(projectId)).map(({ requestingAgency, purpose, plannedStart, plannedEnd }) => ({
    agency: requestingAgency.name,
    purpose,
    start: plannedStart.toISOString().slice(0, 10),
    end: plannedEnd.toISOString().slice(0, 10),
  })), [
    { agency: "BWSSB", purpose: "pipeline", start: "2027-06-10", end: "2027-06-16" },
    { agency: "BESCOM", purpose: "cable", start: "2027-06-15", end: "2027-06-18" },
    { agency: "PWD / Roads Authority", purpose: "resurfacing", start: "2027-06-20", end: "2027-06-24" },
  ]);

  const warnings = await checkRoadConflicts(prisma, resurfacingProjectId);
  assert(warnings.some(({ type }) => type === RoadConflictType.RESTORATION_TOO_EARLY));
  const recommendation = (await recommendationsForSegment(prisma, flagshipSegmentId))[0];
  assert(recommendation);
  const fixtureOrder = recommendation.proposedOrder.filter((item) => item.synthetic || item.projectId && flagshipProjectIds.includes(item.projectId));
  assert.deepEqual(fixtureOrder.map(({ purpose }) => purpose), [
    "pipeline",
    "cable",
    "consolidated restoration",
    "resurfacing",
  ]);
  assert.deepEqual(recommendation.ruleTrace.map(({ rule }) => rule), [1, 2, 3, 4, 5, 6]);
  assert.equal(recommendation.latestOutcome, null);

  console.log("Phase 12 fixture acceptance passed: complete non-road lifecycle, exact three-agency Segment X dates, advisory restoration warning, and explainable pipeline → cable → restoration → resurfacing order.");
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
