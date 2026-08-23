import type { UserRole } from "@civicos/shared";

export const mobileRoles = ["CITIZEN", "ENGINEER"] as const satisfies readonly UserRole[];
