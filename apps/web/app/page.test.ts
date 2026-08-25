import { describe, expect, it } from "vitest";
import { APP_NAME } from "@civicos/shared";
import { roleGatewayOptions } from "./_lib/role-gateway";

describe("web foundation", () => {
  it("uses the shared product identity", () => {
    expect(APP_NAME).toBe("CivicOS");
  });

  it("routes every supported role to its existing login flow", () => {
    expect(roleGatewayOptions.map(({ role, href }) => [role, href])).toEqual([
      ["Citizen", "/login"],
      ["Project Head", "/project-head/login"],
      ["Engineer", "/engineer/login"],
      ["Administrator", "/admin/login"],
    ]);
  });
});
