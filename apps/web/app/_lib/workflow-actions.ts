import type { ProjectState } from "@civicos/shared";

export type EngineerNextAction = {
  kind: "uptake" | "navigate";
  label: string;
  anchor?: "plan" | "start" | "updates" | "completion" | "verification";
  secondary: Array<{ label: string; anchor: "plan" | "start" | "updates" | "completion" | "verification" }>;
};

export function getEngineerNextAction(state: ProjectState): EngineerNextAction {
  if (state === "PENDING_UPTAKE") return { kind: "uptake", label: "Accept Project", secondary: [] };
  if (state === "UPTAKEN") return { kind: "navigate", label: "Set Timeline", anchor: "plan", secondary: [] };
  if (["TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(state)) {
    return { kind: "navigate", label: state === "READY_TO_START" ? "Start Work" : "Review Plan", anchor: state === "READY_TO_START" ? "start" : "plan", secondary: [] };
  }
  if (state === "ACTIVE" || state === "MODIFIED") {
    return {
      kind: "navigate",
      label: "Add Update",
      anchor: "updates",
      secondary: [
        { label: "Update Timeline", anchor: "plan" },
        { label: "Mark Complete", anchor: "completion" },
      ],
    };
  }
  if (state === "COMPLETED") return { kind: "navigate", label: "Submit Evidence", anchor: "completion", secondary: [] };
  if (state === "AWAITING_VERIFICATION") return { kind: "navigate", label: "View Verification", anchor: "verification", secondary: [] };
  return { kind: "navigate", label: "View Project", secondary: [] };
}
