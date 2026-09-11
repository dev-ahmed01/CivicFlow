import type { ProjectState, DependencyState, InspectionStatus } from "./schemas";

// Display/query semantics only. Part III lifecycle and advisory conflict rules are unchanged.
export const ACTIVE_PROJECT_STATES: ProjectState[] = ["ACTIVE", "MODIFIED"];
export const UPCOMING_ENGINEER_WORK_STATES: ProjectState[] = ["UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"];
export const CLOSURE_PROJECT_STATES: ProjectState[] = ["COMPLETED", "AWAITING_VERIFICATION"];
export const COMPLETED_ENGINEER_WORK_STATES: ProjectState[] = [...CLOSURE_PROJECT_STATES, "CLOSED"];
export const TERMINAL_PROJECT_STATES: ProjectState[] = [...COMPLETED_ENGINEER_WORK_STATES, "CANCELLED"];
export const OPEN_INSPECTION_STATES: InspectionStatus[] = ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"];
export const OPEN_DEPENDENCY_STATES: DependencyState[] = ["REQUESTED", "PENDING_RESPONSE", "ASSIGNED", "ESCALATED", "DECLINED_UNAVAILABLE"];
export const RESPONSE_DEPENDENCY_STATES: DependencyState[] = ["REQUESTED", "PENDING_RESPONSE"];
export const ENGINEER_DEPENDENCY_STATES: DependencyState[] = ["REQUESTED", "PENDING_RESPONSE", "ASSIGNED", "ESCALATED"];
export const isEngineerDependencyState = (state: string): boolean => ENGINEER_DEPENDENCY_STATES.includes(state as DependencyState);
export const ENGINEER_STAGE_STATES = { scheduled: UPCOMING_ENGINEER_WORK_STATES, active: ACTIVE_PROJECT_STATES, completed: COMPLETED_ENGINEER_WORK_STATES };
export const isActiveProjectState = (state: string): boolean => ACTIVE_PROJECT_STATES.includes(state as ProjectState);
export const isUpcomingProjectState = (state: string): boolean => UPCOMING_ENGINEER_WORK_STATES.includes(state as ProjectState);
export const isClosureProjectState = (state: string): boolean => CLOSURE_PROJECT_STATES.includes(state as ProjectState);
export const isCompletedProjectState = (state: string): boolean => COMPLETED_ENGINEER_WORK_STATES.includes(state as ProjectState);
export const isTerminalProjectState = (state: string): boolean => TERMINAL_PROJECT_STATES.includes(state as ProjectState);
export const isOpenDependencyState = (state: string): boolean => OPEN_DEPENDENCY_STATES.includes(state as DependencyState);
export function dependencyNeedsAttention(dependency: { state: string; deadline: Date | string }, now = Date.now()): boolean {
  return isOpenDependencyState(dependency.state) && (RESPONSE_DEPENDENCY_STATES.includes(dependency.state as DependencyState) || dependency.state === "ESCALATED" || dependency.state === "DECLINED_UNAVAILABLE" || new Date(dependency.deadline).getTime() < now);
}
export function projectPipelineStage(state: string): "READY" | "SCHEDULED" | "ACTIVE" | "CLOSURE" | "CLOSED" {
  if (isActiveProjectState(state)) return "ACTIVE";
  if (isClosureProjectState(state)) return "CLOSURE";
  if (["CLOSED", "CANCELLED"].includes(state)) return "CLOSED";
  if (["TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(state)) return "SCHEDULED";
  return "READY";
}

export function engineerWorkload(projects: { id?: string; state: string; plannedEnd?: Date | string | null }[], inspections: { deadline: Date | string }[], actions: { deadline: Date | string; type?: string; projectId?: string | null }[], now = Date.now()) {
  const activeWorks = projects.filter(({ state }) => isActiveProjectState(state)).length;
  const pendingAssignments = projects.filter(({ state }) => state === "PENDING_UPTAKE").length;
  const pendingInspections = inspections.length;
  // Inspection deadlines also have WorkflowActions; count their inspection record once.
  const planned = projects.filter((p) => p.plannedEnd && !isTerminalProjectState(p.state));
  const deadlines = [...inspections, ...actions.filter(({ type, projectId }) => (!type || !["INSPECT_TICKET", "ACCEPT_INSPECTION", "COMPLETE_INSPECTION"].includes(type)) && !(projectId && planned.some((p) => p.id === projectId) && type && ["COMPLETE_WORK", "START_WORK"].includes(type)))].map(({ deadline }) => new Date(deadline).getTime());
  deadlines.push(...planned.map((p) => new Date(p.plannedEnd!).getTime()));
  const overdueTasks = deadlines.filter((deadline) => deadline < now).length;
  const next = deadlines.filter((deadline) => deadline >= now).sort((a, b) => a - b)[0];
  const loadScore = activeWorks * 2 + pendingAssignments + pendingInspections + overdueTasks * 2;
  const loadLabel = loadScore >= 7 ? "High load" : loadScore >= 3 ? "Moderate load" : "Available";
  const loadReason = `${activeWorks} active work${activeWorks === 1 ? "" : "s"}, ${pendingAssignments} pending assignment${pendingAssignments === 1 ? "" : "s"}, ${pendingInspections} inspection${pendingInspections === 1 ? "" : "s"}${overdueTasks ? `, ${overdueTasks} overdue` : ""}`;
  return { activeWorks, pendingAssignments, pendingInspections, overdueTasks, nextDeadline: next === undefined ? null : new Date(next), loadLabel, loadReason };
}
