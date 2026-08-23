"use client";

import type { ProjectConflict, ProjectListItem } from "@civicos/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../_lib/api";

function ConflictPanel({ conflicts }: { conflicts: ProjectConflict[] }) {
  if (conflicts.length === 0) return null;
  return <section aria-labelledby="conflict-panel-title" className="portal-panel conflict-panel"><p className="eyebrow">Advisory coordination check</p><h2 id="conflict-panel-title">{conflicts.length} timeline {conflicts.length === 1 ? "warning" : "warnings"}</h2><p>These warnings do not block either agency from editing or saving its project.</p><div className="conflict-list">{conflicts.map((conflict) => <article className={`conflict-item ${conflict.severity === "PROMINENT" ? "prominent" : "inline"}`} key={conflict.id}><div><strong>{conflict.conflictingProjectName}</strong><span className="conflict-severity">{conflict.severity === "PROMINENT" ? "Prominent warning" : "Inline note"}</span></div><p>{conflict.conflictingAgency.name}</p><dl><div><dt>Overlap</dt><dd>{new Date(conflict.overlapStart).toLocaleDateString("en-IN")} – {new Date(conflict.overlapEnd).toLocaleDateString("en-IN")}</dd></div><div><dt>Location</dt><dd>{conflict.locationDescription}</dd></div></dl><small>{conflict.reason}</small></article>)}</div></section>;
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectListItem>();
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      apiFetch<{ project: ProjectListItem }>(`/projects/${projectId}`),
      apiFetch<{ conflicts: ProjectConflict[] }>(`/projects/${projectId}/conflicts`),
    ]).then(([projectResult, conflictResult]) => {
      setProject(projectResult.project);
      setConflicts(conflictResult.conflicts);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load project"));
  }, [projectId]);

  if (!project && !error) return <p className="portal-muted">Loading project…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;
  return <><header className="portal-heading"><div><Link className="back-link" href="/project-head/projects">← Projects</Link><p className="eyebrow">Agency project</p><h1>{project.ticket?.title ?? "Project record"}</h1><p>Created {new Date(project.createdAt).toLocaleDateString("en-IN")}</p></div><span className="state-chip">{project.state.replaceAll("_", " ")}</span></header><ConflictPanel conflicts={conflicts} /><section className="portal-panel"><dl className="detail-list"><div><dt>Project ID</dt><dd><code>{project.id}</code></dd></div><div><dt>Ticket</dt><dd>{project.ticket ? <Link href={`/project-head/tickets/${project.ticket.id}`}>{project.ticket.id}</Link> : "Standalone"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "—"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Timeline</dt><dd>{project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Set by the Engineer in Phase 6"}</dd></div></dl></section></>;
}
