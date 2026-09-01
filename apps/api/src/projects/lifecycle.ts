import { ProjectState } from "db";

export function canSaveTimeline(state: ProjectState): boolean {
  const editableStates: ReadonlySet<ProjectState> = new Set([
    ProjectState.UPTAKEN,
    ProjectState.READY_TO_START,
    ProjectState.ACTIVE,
    ProjectState.MODIFIED,
  ]);
  return editableStates.has(state);
}

export function stateAfterTimelineCheck(actualStart: Date | null): ProjectState {
  return actualStart ? ProjectState.ACTIVE : ProjectState.READY_TO_START;
}

export function canStartWork(state: ProjectState): boolean {
  return state === ProjectState.READY_TO_START;
}
