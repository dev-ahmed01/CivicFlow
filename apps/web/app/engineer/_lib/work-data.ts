import { isTerminalProjectState } from "@civicos/shared";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { apiFetch } from "./api";

export const workViews = ["assigned", "scheduled", "active", "completed"] as const;
export type WorkView = typeof workViews[number];
export type EngineerWork = ProjectListItem & { editable?: boolean };
export type WorkBlocker = { id: string; title: string; severity: string; project: { id: string; title: string; referenceNumber: string } };

export async function loadWorkStage(view: WorkView): Promise<EngineerWork[]> {
  const query = new URLSearchParams({ scope: view === "assigned" ? "assigned" : "mine", limit: "50" });
  if (view !== "assigned") query.set("stage", view);
  const items: EngineerWork[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    query.set("page", String(page));
    const result = await apiFetch<{ projects: EngineerWork[]; pagination: PaginationMeta }>(`/projects?${query}`);
    items.push(...result.projects);
    totalPages = result.pagination.totalPages;
    page++;
  } while (page <= totalPages);
  return items;
}

export function isWorkOverdue(work: ProjectListItem, now = Date.now()): boolean {
  return !isTerminalProjectState(work.state) && Boolean(work.action && new Date(work.action.deadline).getTime() < now);
}
