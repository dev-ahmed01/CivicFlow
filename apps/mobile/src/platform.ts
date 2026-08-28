import type { UserRole } from "@civicos/shared";

export const mobileRoles = ["CITIZEN", "ENGINEER"] as const satisfies readonly UserRole[];

export function pickerRequiresMediaLibraryPermission(platform: string): boolean {
  // Android uses the scoped system photo picker (native on API 33+ and the
  // AndroidX fallback on older supported releases).
  return platform !== "android";
}
