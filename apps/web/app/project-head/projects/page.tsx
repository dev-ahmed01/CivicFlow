"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
import { PaginationControls } from "../../_components/ui";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  useEffect(() => { void apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>(`/projects?page=${page}&limit=20`).then((result) => { setProjects(result.projects); setPagination(result.pagination); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load projects")); }, [page]);
  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">Agency delivery</p><h1>Projects</h1><p>Projects created from inspected tickets in your agency.</p></div></header>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="table-card"><table><thead><tr><th>Project</th><th>Ticket</th><th>Ward</th><th>Engineer</th><th>Status</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td><Link href={`/project-head/projects/${project.id}`}><code>{project.id.slice(0, 8)}</code></Link></td><td>{project.ticket?.title ?? "Standalone project"}</td><td>{project.ticket?.ward.name ?? "—"}</td><td>{project.engineer?.email ?? "Unassigned"}</td><td><span className="state-chip">{project.state.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>{projects.length === 0 ? <div className="empty-state"><strong>No projects yet.</strong><span>Complete a ticket inspection to create one.</span></div> : null}</section>
      <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
    </>
  );
}
