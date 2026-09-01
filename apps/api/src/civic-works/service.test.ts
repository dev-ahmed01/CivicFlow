import { describe, expect, it } from "vitest";
import {
  assertCoordinationRead,
  assertCitizenTransparencyRead,
  CivicWorkError,
  civicWorkManageAgency,
  civicWorkReadScope,
  classifyCivicWorkPeriod,
  toPublicCivicWork,
} from "./service";

const agencyId = "20000000-0000-4000-8000-000000000001";
const userId = "40000000-0000-4000-8000-000000000101";

describe("civic work RBAC scope", () => {
  it("allows a Project Head to manage only their own agency", () => {
    expect(civicWorkManageAgency({ userId, role: "PROJECT_HEAD", agencyId })).toBe(agencyId);
    expect(civicWorkReadScope({ userId, role: "PROJECT_HEAD", agencyId })).toEqual({ agencyId });
  });

  it("limits Engineers to assigned work and never grants management", () => {
    expect(civicWorkReadScope({ userId, role: "ENGINEER", agencyId })).toEqual({ agencyId, engineerId: userId });
    expect(() => civicWorkManageAgency({ userId, role: "ENGINEER", agencyId })).toThrow(CivicWorkError);
  });

  it("rejects Citizens from the operational registry", () => {
    expect(() => civicWorkReadScope({ userId, role: "CITIZEN", agencyId: null })).toThrow(CivicWorkError);
  });

  it("allows cross-agency coordination reads only for Project Heads", () => {
    expect(() => assertCoordinationRead({ userId, role: "PROJECT_HEAD", agencyId })).not.toThrow();
    expect(() => assertCoordinationRead({ userId, role: "ENGINEER", agencyId })).toThrow(CivicWorkError);
    expect(() => assertCoordinationRead({ userId, role: "CITIZEN", agencyId: null })).toThrow(CivicWorkError);
  });

  it("reserves the public nearby view for citizens", () => {
    expect(() => assertCitizenTransparencyRead({ userId, role: "CITIZEN", agencyId: null })).not.toThrow();
    expect(() => assertCitizenTransparencyRead({ userId, role: "PROJECT_HEAD", agencyId })).toThrow(CivicWorkError);
  });
});

describe("citizen civic work privacy boundary", () => {
  it("returns only public fields and rounds distance", () => {
    const work = toPublicCivicWork({
      id: "90000000-0000-4000-8000-000000000001",
      referenceNumber: "CW-202608-0001",
      workType: "Road Damage",
      agency: "PWD",
      ward: "Jayanagar",
      latitude: 12.93,
      longitude: 77.584,
      distanceMeters: 143.7,
      state: "ACTIVE",
      plannedStart: new Date("2026-08-20T00:00:00.000Z"),
      plannedEnd: new Date("2026-09-02T00:00:00.000Z"),
      actualCompletion: null,
    });

    expect(work).toEqual({
      id: "90000000-0000-4000-8000-000000000001",
      referenceNumber: "CW-202608-0001",
      workType: "Road Damage",
      agency: "PWD",
      approximateLocation: { ward: "Jayanagar", latitude: 12.93, longitude: 77.584 },
      distanceMeters: 144,
      status: "IN_PROGRESS",
      statusLabel: "In progress",
      publicProgress: "Work is currently in progress.",
      completionStatus: "IN_PROGRESS",
      plannedStart: new Date("2026-08-20T00:00:00.000Z"),
      expectedCompletion: new Date("2026-09-02T00:00:00.000Z"),
      completedAt: null,
    });
    expect(JSON.stringify(work)).not.toMatch(/engineer|attachment|evidence|dependency|conflict|comment|discussion|purpose/i);
  });
});

describe("civic work calendar classification", () => {
  const asOf = new Date("2026-08-30T12:00:00.000Z");

  it.each([
    ["past by dates", { state: "TIMELINE_SET", plannedStart: "2026-08-01T00:00:00.000Z", plannedEnd: "2026-08-20T00:00:00.000Z" }, "PAST"],
    ["current by overlap", { state: "ACTIVE", plannedStart: "2026-08-25T00:00:00.000Z", plannedEnd: "2026-09-05T00:00:00.000Z" }, "CURRENT"],
    ["future by dates", { state: "TIMELINE_SET", plannedStart: "2026-10-01T00:00:00.000Z", plannedEnd: "2026-10-05T00:00:00.000Z" }, "FUTURE"],
    ["past by terminal state", { state: "CANCELLED", plannedStart: "2026-10-01T00:00:00.000Z", plannedEnd: "2026-10-05T00:00:00.000Z" }, "PAST"],
  ] as const)("classifies %s", (_label, work, expected) => {
    expect(classifyCivicWorkPeriod(work, asOf)).toBe(expected);
  });
});
