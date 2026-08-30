import { describe, expect, it } from "vitest";
import {
  assertCoordinationRead,
  CivicWorkError,
  civicWorkManageAgency,
  civicWorkReadScope,
  classifyCivicWorkPeriod,
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

  it("allows cross-agency coordination reads only for Project Heads and Admins", () => {
    expect(() => assertCoordinationRead({ userId, role: "PROJECT_HEAD", agencyId })).not.toThrow();
    expect(() => assertCoordinationRead({ userId, role: "ADMIN", agencyId: null })).not.toThrow();
    expect(() => assertCoordinationRead({ userId, role: "ENGINEER", agencyId })).toThrow(CivicWorkError);
    expect(() => assertCoordinationRead({ userId, role: "CITIZEN", agencyId: null })).toThrow(CivicWorkError);
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
