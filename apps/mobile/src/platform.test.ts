import { describe, expect, it } from "vitest";
import { mobileRoles } from "./platform";

describe("mobile role boundary", () => {
  it("contains only the native-app roles", () => {
    expect(mobileRoles).toEqual(["CITIZEN", "ENGINEER"]);
  });
});
