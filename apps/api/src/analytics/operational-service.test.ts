import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => Object.fromEntries(["project", "conflictLog", "roadConflictLog", "dependency", "coordinationRequest", "completionEvidence", "sequencingRecommendation", "systemConfig"].map(key => [key, { findMany: vi.fn(), findUnique: vi.fn() }])));
vi.mock("db", () => ({ prisma: mocks }));
vi.mock("./validation", () => ({ readInsightsBenchmark: async () => null }));
import { buildOperationalAnalytics } from "./operational-service";
const d = (day: number, hour = 0) => new Date(Date.UTC(2026, 8, day, hour));
const agency = { id: "agency-1", name: "BWSSB" }, peerAgency = { id: "agency-2", name: "BESCOM" };
const transition = (toState: string, day: number) => ({ toState, createdAt: d(day) });
const project = (id = "p1") => ({ id, referenceNumber: `CW-${id}`, title: "Jakkasandra water main", state: "ACTIVE", createdAt: d(1), actualStart: d(8), actualCompletion: null, agencyId: agency.id, agency, wardId: "w1", ward: { id: "w1", name: "Jakkasandra" }, categoryId: "c1", category: { id: "c1", name: "Water" }, ticket: null, stateTransitions: [transition("CREATED", 1), transition("ACTIVE", 8)] });
const request = () => ({ id: "cr1", projectId: "p1", status: "CLOSED", createdAt: d(5), sentAt: d(5), closedAt: d(6), responseDeadline: d(6), subject: "Align works", requestingAgency: agency, respondingAgency: peerAgency, entries: [{ toStatus: "SENT", createdAt: d(5) }, { toStatus: "CLOSED", createdAt: d(6) }] });
const conflict = (id = "conflict1", day = 5) => ({ id, timelineFingerprint: id, projectId: "p1", conflictingProjectId: "peer", project: project(), conflictingProject: { ...project("peer"), actualStart: d(9) }, createdAt: d(day), projectAgencyId: agency.id, projectAgency: agency, conflictingAgency: peerAgency, severity: "PROMINENT", coordinationRequests: [request()] });
const dependency = () => ({ id: "dep1", projectId: "p1", state: "ASSIGNED", requirement: "Valve isolation", createdAt: d(5), deadline: d(8), respondedAt: d(6), requestingAgencyId: agency.id, respondingAgencyId: peerAgency.id, requestingAgency: agency, respondingAgency: peerAgency, stateTransitions: [{ toState: "ASSIGNED", createdAt: d(5, 12) }] });
const road = (id = "risk1") => ({ id, projectId: "p1", conflictingProjectId: null, conflictingProject: null, segmentId: "s1", type: "REPEATED_EXCAVATION_RISK", createdAt: d(5), projectAgencyId: agency.id, projectAgency: agency, conflictingAgency: null, project: { intervention: { id: "i1", affectedLengthM: 120 } }, segment: { roadName: "12th Main" }, reason: "Recent restoration", coordinationRequests: [] });
const recommendation = () => ({ id: "seq1", segmentId: "s1", projectIds: ["p1"], logs: [{ id: "log1", outcome: "ACCEPTED", actedAt: d(6) }] });
const evidence = (id = "e1", projectId = "p1", decision = "VERIFIED") => ({ id, projectId, createdAt: d(7), uploadedAt: d(8), verifications: [{ id: `v-${id}`, decision, createdAt: d(9) }] });
const run = () => buildOperationalAnalytics({ from: d(5), to: d(11) }, d(12));
const value = (report: Awaited<ReturnType<typeof run>>, key: string) => report.metrics.find(m => m.key === key)!;

describe("record-backed operational Insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(mocks)) mock.findMany.mockResolvedValue([]);
    mocks.systemConfig!.findUnique.mockResolvedValue({ value: "5" });
    mocks.project!.findMany.mockResolvedValue([project()]);
  });
  it("counts before, equal-to and after execution against the entire denominator", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([conflict("before", 5), conflict("equal", 8), conflict("after", 9)]);
    const r = await run();
    expect(value(r, "conflicts-before-execution")).toMatchObject({ value: 33.3, numerator: 1, denominator: 3 });
    expect(r.details["conflicts-before-execution"]).toHaveLength(3);
  });
  it("uses the earliest ACTIVE transition or actualStart of either work", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([{ ...conflict(), conflictingProject: { ...project("peer"), actualStart: null, stateTransitions: [transition("ACTIVE", 4)] } }]);
    expect(value(await run(), "conflicts-before-execution").value).toBe(0);
  });
  it("does not infer success from an active work with missing start history", async () => {
    mocks.project!.findMany.mockResolvedValue([{ ...project(), actualStart: null, stateTransitions: [] }]);
    mocks.roadConflictLog!.findMany.mockResolvedValue([road()]);
    expect(value(await run(), "conflicts-before-execution").value).toBe(0);
  });
  it("includes canonical generic conflicts with the owned work on the second side", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([{ ...conflict(), projectId: "peer", conflictingProjectId: "p1" }]);
    expect(value(await run(), "conflicts-resolved").denominator).toBe(1);
  });
  it("counts only linked completed/closed coordination as resolution", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([conflict(), { ...conflict("c2"), coordinationRequests: [{ ...request(), closedAt: null, entries: [{ toStatus: "ACCEPTED", createdAt: d(6) }] }] }]);
    expect(value(await run(), "conflicts-resolved")).toMatchObject({ value: 50, numerator: 1, denominator: 2 });
  });
  it("does not leak future closure outcomes into a previous cutoff", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([{ ...conflict("old", 2), coordinationRequests: [request()] }]);
    const r = await run();
    expect(value(r, "conflicts-resolved").previous).toMatchObject({ value: 0, denominator: 1 });
  });
  it.each(["ASSIGNED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED", "FULFILLED"])("measures first meaningful %s response, not respondedAt overwrite", async state => {
    mocks.dependency!.findMany.mockResolvedValue([{ ...dependency(), stateTransitions: [{ toState: "ESCALATED", createdAt: d(5, 2) }, { toState: state, createdAt: d(5, 12) }] }]);
    expect(value(await run(), "dependency-response-time")).toMatchObject({ value: 12, sampleSize: 1 });
  });
  it("excludes unanswered, future and invalid negative-duration responses", async () => {
    mocks.dependency!.findMany.mockResolvedValue([null, d(20), d(4)].map((respondedAt, i) => ({ ...dependency(), id: `d${i}`, stateTransitions: [], respondedAt })));
    expect(value(await run(), "dependency-response-time").value).toBeNull();
  });
  it("measures closedAt minus sentAt and excludes invalid durations", async () => {
    mocks.coordinationRequest!.findMany.mockResolvedValue([request(), { ...request(), id: "negative", sentAt: d(7) }, { ...request(), id: "missing", sentAt: null }]);
    expect(value(await run(), "coordination-turnaround")).toMatchObject({ value: 24, sampleSize: 1 });
  });
  it("deduplicates blocked works and excludes terminal and same-agency requests", async () => {
    mocks.project!.findMany.mockResolvedValue([project(), { ...project("closed"), stateTransitions: [transition("CLOSED", 6)] }]);
    mocks.dependency!.findMany.mockResolvedValue([dependency(), { ...dependency(), id: "d2" }, { ...dependency(), id: "d3", projectId: "closed" }]);
    const r = await run(); expect(value(r, "works-blocked").value).toBe(1);
    expect(value(r, "works-blocked").comparison.interpretation).toBe("Context only");
    mocks.dependency!.findMany.mockResolvedValue([{ ...dependency(), respondingAgencyId: agency.id }]);
    expect(value(await run(), "works-blocked").value).toBe(0);
  });
  it("counts overdue open requests at each snapshot, excluding draft and closed", async () => {
    mocks.coordinationRequest!.findMany.mockResolvedValue([request(), { ...request(), id: "open", closedAt: null, entries: [{ toStatus: "SENT", createdAt: d(5) }] }, { ...request(), id: "draft", sentAt: null, closedAt: null, entries: [] }]);
    expect(value(await run(), "overdue-coordination").value).toBe(1);
  });
  it("uses first upload rather than reservation or later successful attempts", async () => {
    mocks.completionEvidence!.findMany.mockResolvedValue([evidence("first", "p1", "REWORK_REQUESTED"), { ...evidence("later"), createdAt: d(1), uploadedAt: d(10) }]);
    const r = await run(); expect(value(r, "first-time-completion")).toMatchObject({ value: 0, denominator: 1 });
    expect(value(r, "rework-rate").value).toBe(100);
  });
  it("requires VERIFIED and no rework even when both decisions exist", async () => {
    const e = evidence(); e.verifications.push({ id: "v2", decision: "REWORK_REQUESTED", createdAt: d(10) });
    mocks.completionEvidence!.findMany.mockResolvedValue([e]);
    expect(value(await run(), "first-time-completion").value).toBe(0);
  });
  it("does not assess an unverified upload or import later verification into previous period", async () => {
    mocks.completionEvidence!.findMany.mockResolvedValue([{ ...evidence(), verifications: [] }]);
    expect(value(await run(), "first-time-completion").value).toBeNull();
  });
  it("measures verified closures and required uploaded evidence separately", async () => {
    mocks.project!.findMany.mockResolvedValue(["p1", "p2"].map(id => ({ ...project(id), state: "CLOSED", ticket: { state: "CLOSED", stateTransitions: [transition("RESOLVED", 9), transition("CLOSED", 10)] }, stateTransitions: [transition("COMPLETED", 8), transition("CLOSED", 10)] })));
    mocks.completionEvidence!.findMany.mockResolvedValue([evidence()]);
    const r = await run();
    expect(value(r, "verified-closure")).toMatchObject({ value: 50, numerator: 1, denominator: 2 });
    expect(value(r, "evidence-backed-completion")).toMatchObject({ value: 50, numerator: 1, denominator: 2 });
  });
  it("does not label a planning photo completion evidence or include planned works in required evidence population", async () => {
    mocks.project!.findMany.mockResolvedValue([{ ...project(), stateTransitions: [transition("COMPLETED", 8)] }]);
    expect(value(await run(), "evidence-backed-completion").denominator).toBe(0);
  });
  it("links accepted recommendations by project and deduplicates affected intervention length", async () => {
    mocks.roadConflictLog!.findMany.mockResolvedValue([road(), road("risk2")]);
    mocks.sequencingRecommendation!.findMany.mockResolvedValue([recommendation()]);
    const r = await run();
    expect(value(r, "repeated-excavation").value).toBe(2); expect(value(r, "risks-addressed").value).toBe(2);
    expect(value(r, "coordinated-road-length").value).toBe(120); expect(value(r, "sequencing-accepted").value).toBe(1);
  });
  it("rejects unrelated segment acceptances, pre-detection acceptances and superseded decisions", async () => {
    mocks.roadConflictLog!.findMany.mockResolvedValue([road()]);
    const rec = recommendation();
    mocks.sequencingRecommendation!.findMany.mockResolvedValue([{ ...rec, projectIds: ["foreign"] }, { ...rec, logs: [{ ...rec.logs[0], actedAt: d(4) }] }, { ...rec, logs: [...rec.logs, { id: "l2", outcome: "DISMISSED", actedAt: d(7) }] }]);
    expect(value(await run(), "risks-addressed").value).toBe(0);
  });
  it("requires both projects for a duplicate-intervention recommendation", async () => {
    mocks.roadConflictLog!.findMany.mockResolvedValue([{ ...road(), type: "DUPLICATE_INTERVENTION", conflictingProjectId: "peer" }]);
    mocks.sequencingRecommendation!.findMany.mockResolvedValue([recommendation()]);
    expect(value(await run(), "risks-addressed").value).toBe(0);
  });
  it("uses event dates on old works and exclusive IST period boundaries", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([conflict("early", 4), conflict("inside", 5), { ...conflict("end"), createdAt: new Date("2026-09-11T18:30:00Z") }]);
    expect(value(await run(), "conflicts-resolved").denominator).toBe(1);
  });
  it("enforces agency, ward and category at the query root and scopes every downstream table", async () => {
    await buildOperationalAnalytics({ agencyId: "a", wardId: "w", categoryId: "c" }, d(12));
    expect(mocks.project!.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { agencyId: "a", wardId: "w", categoryId: "c", createdAt: { lt: expect.any(Date) } } }));
    for (const key of ["roadConflictLog", "dependency", "coordinationRequest", "completionEvidence"]) expect(mocks[key]!.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: { in: ["p1"] } }) }));
    expect(mocks.sequencingRecommendation!.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ projectIds: { array_contains: ["p1"] } }] }) }));
  });
  it("returns null rather than invented percentages for an empty cohort", async () => {
    mocks.project!.findMany.mockResolvedValue([]);
    const r = await run();
    expect(r.metrics.filter(m => m.unit === "percent" || m.unit === "hours").every(m => m.value === null)).toBe(true);
    expect(r.validation).toBeNull();
  });
  it("marks limited samples using the configured threshold and provides ward outcomes", async () => {
    mocks.conflictLog!.findMany.mockResolvedValue([conflict()]);
    const r = await run(); expect(value(r, "conflicts-resolved").limitedSample).toBe(true);
    expect(r.dimensions.find(d => d.kind === "ward")?.metrics.find(m => m.key === "conflicts-resolved")?.denominator).toBe(1);
    mocks.systemConfig!.findUnique.mockResolvedValue({ value: "1" });
    expect(value(await run(), "conflicts-resolved").limitedSample).toBe(false);
  });
});
