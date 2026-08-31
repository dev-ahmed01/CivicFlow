"use client";

import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { apiFetch } from "./api";

const projectPageSize = 50;

export async function loadAllAgencyProjects(): Promise<ProjectListItem[]> {
  const first = await apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>(`/projects?page=1&limit=${projectPageSize}`);
  if (first.pagination.totalPages <= 1) return first.projects;
  const remaining = await Promise.all(Array.from(
    { length: first.pagination.totalPages - 1 },
    (_, index) => apiFetch<{ projects: ProjectListItem[] }>(`/projects?page=${index + 2}&limit=${projectPageSize}`),
  ));
  return [first.projects, ...remaining.map((page) => page.projects)].flat();
}
