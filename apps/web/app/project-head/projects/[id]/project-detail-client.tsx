"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectListItem } from "@civicos/shared";
import { apiFetch } from "../../_lib/api";

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectListItem>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void apiFetch<{ project: ProjectListItem }>(`/projects/${projectId}`).then((result) => setProject(result.project)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load project"));
  }, [projectId]);
  if (!project && !error) return <p className="portal-muted">Loading project…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;
  return <><header className="portal-heading"><div><Link className="back-link" href="/project-head/projects">← Projects</Link><p className="eyebrow">Agency project</p><h1>{project.ticket?.title ?? "Project record"}</h1><p>Created {new Date(project.createdAt).toLocaleDateString("en-IN")}</p></div><span className="state-chip">{project.state.replaceAll("_", " ")}</span></header><section className="portal-panel"><dl className="detail-list"><div><dt>Project ID</dt><dd><code>{project.id}</code></dd></div><div><dt>Ticket</dt><dd>{project.ticket ? <Link href={`/project-head/tickets/${project.ticket.id}`}>{project.ticket.id}</Link> : "Standalone"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "—"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Timeline</dt><dd>{project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Set by the Engineer in Phase 6"}</dd></div></dl></section></>;
}
