import { describe, expect, it } from "vitest";
import { CivicWorkError, civicWorkManageAgency, civicWorkReadScope } from "./service";

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
});
