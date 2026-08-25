import { describe, expect, it } from "vitest";
import { APP_NAME, citizenLoginSchema } from "@civicos/shared";

describe("web foundation", () => {
  it("uses the shared product identity", () => {
    expect(APP_NAME).toBe("CivicOS");
  });

  it("supports the citizen User ID login contract used by the web experience", () => {
    expect(citizenLoginSchema.safeParse({ userId: "citizen.jayanagar", password: "CityConnect@123" }).success).toBe(true);
  });
});
