import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo workload fixtures", () => {
  const seed = readFileSync(resolve(process.cwd(), "seed.ts"), "utf8");

  it("keeps exactly three PWD Project Head/Engineer examples", () => {
    const workflowBlock = seed.slice(seed.indexOf("const engineerDemoProjects"), seed.indexOf("const retiredEngineerDemoSuffixes"));
    const pwdWorkflowItems = workflowBlock.match(/agencyId: ids\.agencies\.pwd/g) ?? [];
    const flagshipStart = seed.indexOf("const work = [", seed.indexOf("async function seedRoadCuttingDemo"));
    const flagshipBlock = seed.slice(flagshipStart, seed.indexOf("const projectIds = work.map", flagshipStart));
    const pwdFlagshipItems = flagshipBlock.match(/agencyId: ids\.agencies\.pwd/g) ?? [];
    expect(pwdWorkflowItems).toHaveLength(2);
    expect(pwdFlagshipItems).toHaveLength(1);
    expect(workflowBlock).toContain("ProjectState.PENDING_UPTAKE");
    expect(workflowBlock).toContain("ProjectState.COMPLETED");
    expect(flagshipBlock).toContain("purpose: \"resurfacing\"");
  });

  it("retains the database uniqueness guard for one citizen vote per ticket", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const validationModel = schema.slice(schema.indexOf("model Validation {"), schema.indexOf("model ValidationRequest {"));
    expect(validationModel).toContain("@@unique([ticketId, validatorId])");
  });

  it("keeps grievances linked directly to their original ticket", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const grievanceModel = schema.slice(schema.indexOf("model Grievance {"), schema.indexOf("model AdminConfig {"));
    expect(grievanceModel).toContain("ticketId            String");
    expect(grievanceModel).toContain("ticket            Ticket");
  });
});
