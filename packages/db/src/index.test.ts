import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";

describe("generated Prisma client", () => {
  it("exports the CivicOS roles", () => {
    expect(UserRole.PROJECT_HEAD).toBe("PROJECT_HEAD");
  });
});
