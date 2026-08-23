import { describe, expect, it } from "vitest";
import { APP_NAME } from "@civicos/shared";

describe("web foundation", () => {
  it("uses the shared product identity", () => {
    expect(APP_NAME).toBe("CivicOS");
  });
});
