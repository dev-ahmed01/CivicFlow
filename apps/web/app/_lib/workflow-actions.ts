import type { ProjectState } from "@civicos/shared";

export type EngineerNextAction = {
  kind: "uptake" | "navigate";
  label: string;
  anchor?: "execution" | "updates" | "completion" | "verification";
  secondary: Array<{ label: string; anchor: "execution" | "updates" | "completion" | "verification" }>;
};

export function getEngineerNextAction(state: ProjectState): EngineerNextAction {
  if (state === "PENDING_UPTAKE") return { kind: "uptake", label: "Accept Project", secondary: [] };
  if (state === "UPTAKEN") return { kind: "navigate", label: "Set Timeline", anchor: "execution", secondary: [] };
  if (state === "ACTIVE" || state === "MODIFIED") {
    return {
      kind: "navigate",
      label: "Add Update",
      anchor: "updates",
      secondary: [
        { label: "Update Timeline", anchor: "execution" },
        { label: "Mark Complete", anchor: "completion" },
      ],
    };
  }
  if (state === "COMPLETED") return { kind: "navigate", label: "Submit Evidence", anchor: "completion", secondary: [] };
  if (state === "AWAITING_VERIFICATION") return { kind: "navigate", label: "View Verification", anchor: "verification", secondary: [] };
  return { kind: "navigate", label: "View Project", secondary: [] };
}
