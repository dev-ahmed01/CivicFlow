import { describe, expect, it } from "vitest";
import { mobileRoles, pickerRequiresMediaLibraryPermission } from "./platform";

describe("mobile role boundary", () => {
  it("contains only the native-app roles", () => {
    expect(mobileRoles).toEqual(["CITIZEN", "ENGINEER"]);
  });
});

describe("photo picker permissions", () => {
  it("uses the scoped Android photo picker without READ_MEDIA_IMAGES", () => {
    expect(pickerRequiresMediaLibraryPermission("android")).toBe(false);
  });

  it("keeps the platform permission path for iOS", () => {
    expect(pickerRequiresMediaLibraryPermission("ios")).toBe(true);
  });
});
