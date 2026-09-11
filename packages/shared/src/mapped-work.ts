import { civicWorkGeometrySchema, type CivicWorkCalendarItem } from "./schemas";
import { isActiveProjectState, isUpcomingProjectState } from "./work-states";

export function eligibleMappedWorks<T extends { id: string; geometry: unknown }>(works: T[]): T[] {
  return [...new Map(works.filter((work) => civicWorkGeometrySchema.safeParse(work.geometry).success).map((work) => [work.id, work])).values()];
}
export const mappedWorkCategories = {
  active: (work: CivicWorkCalendarItem) => isActiveProjectState(work.state),
  attention: (work: CivicWorkCalendarItem) => work.conflictCount + work.roadConflictCount > 0,
  dependencies: (work: CivicWorkCalendarItem) => work.dependencySummary.open > 0,
  upcoming: (work: CivicWorkCalendarItem) => isUpcomingProjectState(work.state),
  blocked: (work: CivicWorkCalendarItem) => work.dependencySummary.blocked,
};
