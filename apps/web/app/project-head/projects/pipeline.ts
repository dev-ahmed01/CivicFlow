import { projectPipelineStage } from "@civicos/shared";
import type { ProjectState, TicketState } from "@civicos/shared";

export type WorkView = "ALL" | "INTAKE" | "INSPECTION" | "READY" | "SCHEDULED" | "ACTIVE" | "CLOSURE" | "CLOSED";

export type WorkLifecycle = "ALL" | "UPCOMING" | "ONGOING" | "REVIEW" | "COMPLETED";

// Display grouping only: original workflow states and legacy drill-downs remain intact.
export function lifecycleGroup(kind: "ticket" | "project", state: TicketState | ProjectState): Exclude<WorkLifecycle, "ALL"> {
  const stage = pipelineStage(kind, state);
  if (stage === "ACTIVE") return "ONGOING";
  if (stage === "CLOSURE") return "REVIEW";
  if (stage === "CLOSED") return "COMPLETED";
  return "UPCOMING";
}

export function pipelineStage(kind: "ticket" | "project", state: TicketState | ProjectState): Exclude<WorkView, "ALL"> {
  if (kind === "ticket") {
    if (state === "ROUTED_TO_AGENCY") return "INTAKE";
    if (state === "INSPECTION_DUE") return "INSPECTION";
    return "READY";
  }
  return projectPipelineStage(state);
}
