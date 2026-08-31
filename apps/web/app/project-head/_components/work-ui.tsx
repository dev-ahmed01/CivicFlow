"use client";

import type { ProjectState, TicketState } from "@civicos/shared";
import type { ReactNode } from "react";
import { StatusChip, type SemanticTone } from "../../_components/ui";

export type WorkStage = "intake" | "inspection" | "planning" | "execution" | "closure";

const workStages: Array<{ id: WorkStage; label: string }> = [
  { id: "intake", label: "Reported" },
  { id: "inspection", label: "Inspection" },
  { id: "planning", label: "Planning" },
  { id: "execution", label: "Execution" },
  { id: "closure", label: "Closure" },
];

const ticketLabels: Record<TicketState, string> = {
  DRAFT: "Draft",
  AI_CHECK_PENDING: "Initial review",
  AI_FLAGGED: "Review required",
  PENDING_VALIDATION: "Community review",
  VALIDATED: "Validated",
  ROUTED_TO_AGENCY: "Needs inspection",
  INSPECTION_DUE: "Inspection due",
  INSPECTION_COMPLETE: "Ready for work setup",
  PROJECT_CREATED: "Work created",
  ENGINEER_ASSIGNED: "Engineer assigned",
  WORK_IN_PROGRESS: "In progress",
  WORK_COMPLETED: "Completion submitted",
  AWAITING_CITIZEN_VERIFICATION: "Awaiting verification",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const projectLabels: Record<ProjectState, string> = {
  CREATED: "Awaiting engineer",
  PENDING_UPTAKE: "Engineer assigned",
  UPTAKEN: "Planning in progress",
  TIMELINE_SET: "Schedule set",
  CONFLICT_CHECKED: "Coordination checked",
  ACTIVE: "In progress",
  MODIFIED: "Schedule updated",
  COMPLETED: "Completion submitted",
  AWAITING_VERIFICATION: "Awaiting verification",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

function toneForState(state: TicketState | ProjectState): SemanticTone {
  if (["CLOSED", "RESOLVED"].includes(state)) return "success";
  if (["REJECTED", "CANCELLED"].includes(state)) return "danger";
  if (["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE", "CREATED", "PENDING_UPTAKE", "COMPLETED", "AWAITING_VERIFICATION", "AWAITING_CITIZEN_VERIFICATION"].includes(state)) return "warning";
  return "info";
}

export function workStateLabel(state: TicketState | ProjectState): string {
  return state in ticketLabels ? ticketLabels[state as TicketState] : projectLabels[state as ProjectState];
}

export function WorkStatus({ state }: { state: TicketState | ProjectState }) {
  return <StatusChip label={workStateLabel(state)} tone={toneForState(state)} />;
}

export function ticketWorkStage(state: TicketState): WorkStage {
  if (["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(state)) return "inspection";
  if (["INSPECTION_COMPLETE", "PROJECT_CREATED", "ENGINEER_ASSIGNED"].includes(state)) return "planning";
  if (["WORK_IN_PROGRESS", "WORK_COMPLETED"].includes(state)) return "execution";
  if (["AWAITING_CITIZEN_VERIFICATION", "RESOLVED", "CLOSED", "REJECTED", "CANCELLED"].includes(state)) return "closure";
  return "intake";
}

export function projectWorkStage(state: ProjectState): WorkStage {
  if (["ACTIVE", "MODIFIED", "COMPLETED"].includes(state)) return "execution";
  if (["AWAITING_VERIFICATION", "CLOSED", "CANCELLED"].includes(state)) return "closure";
  return "planning";
}

export function WorkLifecycle({ current }: { current: WorkStage }) {
  const currentIndex = workStages.findIndex((stage) => stage.id === current);
  return <ol aria-label="Work lifecycle" className="ph-work-lifecycle">
    {workStages.map((stage, index) => <li aria-current={index === currentIndex ? "step" : undefined} className={index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming"} key={stage.id}><span aria-hidden="true" /><strong>{stage.label}</strong></li>)}
  </ol>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="ph-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</header>;
}

export function CompactAlert({ title, children, action, tone = "warning" }: { title: string; children: ReactNode; action?: ReactNode; tone?: "warning" | "danger" | "info" }) {
  return <section className={`ph-compact-alert ${tone}`}><div><strong>{title}</strong><p>{children}</p></div>{action}</section>;
}

export function RecordTabs<T extends string>({ active, onChange, tabs }: { active: T; onChange: (tab: T) => void; tabs: Array<{ id: T; label: string; count?: number }> }) {
  return <div aria-label="Work record sections" className="portal-tabs ph-record-tabs" role="tablist">{tabs.map((tab) => <button aria-selected={active === tab.id} key={tab.id} onClick={() => onChange(tab.id)} role="tab" type="button">{tab.label}{typeof tab.count === "number" && tab.count > 0 ? ` (${tab.count})` : ""}</button>)}</div>;
}
