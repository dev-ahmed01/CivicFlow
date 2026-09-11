import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo workload fixtures", () => {
  const seed = readFileSync(resolve(process.cwd(), "seed.ts"), "utf8");

  it("uses fresh dates and exact primary engineer names", () => {
    expect(seed).not.toMatch(/new Date\("20\d{2}-/);
    expect(seed).toContain('displayName: "Engineer 1"');
    expect(seed).toContain('displayName: "Engineer 2"');
    expect(seed).toContain('displayName: "Engineer 3"');
    expect(seed).toContain('await clearDemoDatabase(transaction)');
  });

  it("retains the database uniqueness guard for one citizen vote per ticket", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const validationModel = schema.slice(schema.indexOf("model Validation {"), schema.indexOf("model ValidationRequest {"));
    expect(validationModel).toContain("@@unique([ticketId, validatorId])");
  });

  it("keeps grievances linked directly to their original ticket", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const grievanceModel = schema.slice(schema.indexOf("model Grievance {"), schema.indexOf("model SystemConfig {"));
    expect(grievanceModel).toContain("ticketId            String");
    expect(grievanceModel).toContain("ticket            Ticket");
  });
});
