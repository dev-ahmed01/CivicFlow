import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "db";
import { demoWorkflowEnabled, withDemoDefaults } from "./demo-workflow";
const profile = vi.hoisted(() => ({ value: "local" }));
vi.mock("./env", () => ({ getEnv: () => ({ DEPLOYMENT_PROFILE: profile.value }) }));
afterEach(() => { vi.restoreAllMocks(); profile.value = "local"; });

describe("demo form policy", () => {
  it("never activates in production, even with enabled demo configuration", async () => {
    profile.value = "production";
    const config = vi.spyOn(prisma.systemConfig, "findUnique");
    expect(await demoWorkflowEnabled()).toBe(false);
    expect(config).not.toHaveBeenCalled();
  });
  it("requires an explicit database switch in local and free_demo profiles", async () => {
    const config = vi.spyOn(prisma.systemConfig, "findUnique").mockResolvedValue(null);
    expect(await demoWorkflowEnabled()).toBe(false);
    config.mockResolvedValue({ value: true } as never);
    for (const value of ["local", "free_demo"]) { profile.value = value; expect(await demoWorkflowEnabled()).toBe(true); }
  });
  it("defaults absent/blank fields while retaining supplied decisions and invalid values for validation", () => {
    expect(withDemoDefaults({ note: "  ", severity: "HIGH", latitude: 0, deadline: "invalid" }, { note: "Internal default", severity: "MEDIUM", latitude: 12, deadline: "2026-09-11", complexity: "LOW" })).toEqual({ note: "Internal default", severity: "HIGH", latitude: 0, deadline: "invalid", complexity: "LOW" });
  });
});
