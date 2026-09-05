import type { InspectionDetail, DependencyListItem } from "@civicos/shared";

export const inspectionFilters = ["All", "Assigned", "Accepted", "In progress", "Completed", "Overdue"] as const;
export type InspectionFilter = (typeof inspectionFilters)[number];

export function isInspectionOpen(inspection: Pick<InspectionDetail, "status">): boolean {
  return !["SUBMITTED", "REVIEWED", "CANCELLED"].includes(inspection.status);
}

export function matchesInspectionFilter(inspection: Pick<InspectionDetail, "status" | "deadline">, filter: InspectionFilter, now: number): boolean {
  if (filter === "All") return true;
  if (filter === "Completed") return ["SUBMITTED", "REVIEWED"].includes(inspection.status);
  if (filter === "Overdue") return isInspectionOpen(inspection) && new Date(inspection.deadline).getTime() < now;
  return inspection.status === filter.toUpperCase().replaceAll(" ", "_");
}

export function inspectionAction(status: InspectionDetail["status"]): string {
  if (status === "ASSIGNED") return "Review assignment";
  if (status === "ACCEPTED") return "Start inspection";
  if (status === "IN_PROGRESS") return "Continue";
  return "Review submission";
}

export function isDependencyOpen(dependency: Pick<DependencyListItem, "state">): boolean {
  return !["FULFILLED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED"].includes(dependency.state);
}
