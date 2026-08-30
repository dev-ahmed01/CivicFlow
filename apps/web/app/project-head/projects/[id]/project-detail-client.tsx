"use client";

import type { Agency, DependencyListItem, EngineerProjectDetail, ProjectConflict, SequencingRecommendationOutcome } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ConflictIndicator, DependencyFlowCard, NextActionButton } from "../../../_components/operations";
import { RoadIntelligencePanel, type RoadIntelligenceData } from "../../../_components/road-intelligence-panel";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { CoordinationComposer } from "../../_components/coordination-composer";
import { apiFetch } from "../../_lib/api";

const emptyRoadData: RoadIntelligenceData = { conflicts: [], recommendations: [], segment: null, interventionHistory: [] };

function ConflictPanel({ conflicts }: { conflicts: ProjectConflict[] }) {
  if (conflicts.length === 0) return null;
  return <section aria-labelledby="conflict-panel-title" className="portal-panel conflict-panel">
    <div className="panel-title-row"><div><p className="eyebrow">Advisory coordination check</p><h2 id="conflict-panel-title">Timeline coordination</h2></div><ConflictIndicator count={conflicts.length} /></div>
    <p>Warnings remain advisory and never block saving or delivery.</p>
    <div className="conflict-list">{conflicts.map((conflict) => <article className={`conflict-item ${conflict.severity === "PROMINENT" ? "prominent" : "inline"}`} key={conflict.id}>
      <div><strong>{conflict.conflictingProjectName}</strong><span className="conflict-severity">{conflict.severity === "PROMINENT" ? "Prominent warning" : "Inline note"}</span></div>
      <p>{conflict.conflictingAgency.name}</p>
      <dl><div><dt>Overlap</dt><dd>{new Date(conflict.overlapStart).toLocaleDateString("en-IN")} – {new Date(conflict.overlapEnd).toLocaleDateString("en-IN")}</dd></div><div><dt>Location</dt><dd>{conflict.locationDescription}</dd></div></dl>
      <small>{conflict.reason}</small>
    </article>)}</div>
  </section>;
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [roadData, setRoadData] = useState<RoadIntelligenceData>(emptyRoadData);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [requestTypes, setRequestTypes] = useState<string[]>([]);
  const [coordinationOpen, setCoordinationOpen] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [projectResult, conflictResult, roadResult, dependencyResult, options] = await Promise.all([
        apiFetch<{ project: EngineerProjectDetail }>(`/projects/${projectId}`),
        apiFetch<{ conflicts: ProjectConflict[] }>(`/projects/${projectId}/conflicts`),
        apiFetch<RoadIntelligenceData>(`/projects/${projectId}/road-intelligence`),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=sent"),
        apiFetch<{ agencies: Agency[]; requestTypes: string[] }>("/coordination-options"),
      ]);
      setProject(projectResult.project);
      setConflicts(conflictResult.conflicts);
      setRoadData(roadResult);
      setDependencies(dependencyResult.dependencies.filter((dependency) => dependency.projectId === projectId));
      setAgencies(options.agencies);
      setRequestTypes(options.requestTypes);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load project");
    }
  }, [projectId]);
  usePortalPolling(load);

  const actOnRecommendation = async (recommendationId: string, outcome: SequencingRecommendationOutcome, revision?: { plannedStart: string; plannedEnd: string }) => {
    await apiFetch(`/sequencing-recommendations/${recommendationId}/actions`, { method: "POST", body: JSON.stringify({ outcome, ...(revision ? { timelineRevision: { projectId, ...revision } } : {}) }) });
    notifyPortalDataChanged();
    await load();
  };

  if (!project && !error) return <p className="portal-muted">Loading project…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;
  const availableAgencies = agencies.filter((agency) => agency.id !== project.agencyId);

  return <>
    <header className="portal-heading"><div><Link className="back-link" href="/project-head/projects">← Projects</Link><p className="eyebrow">Agency project</p><h1>{project.ticket?.title ?? "Project record"}</h1><p>Created {new Date(project.createdAt).toLocaleDateString("en-IN")}</p></div><div className="heading-actions"><span className="state-chip">{project.state.replaceAll("_", " ")}</span><NextActionButton onClick={() => setCoordinationOpen((open) => !open)}>Coordinate with agency</NextActionButton></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {project.grievance ? <section className="portal-panel grievance-card-escalated"><p className="eyebrow">Linked grievance · {project.grievance.status.replaceAll("_", " ")}</p><h2>{project.grievance.reason.replaceAll("_", " ")}</h2><p>Created {new Date(project.grievance.createdAt).toLocaleDateString("en-IN")}</p><NextActionButton href={`/project-head/grievances?grievance=${project.grievance.id}`}>Review grievance</NextActionButton></section> : null}
    {coordinationOpen ? <CoordinationComposer agencies={availableAgencies} onCancel={() => setCoordinationOpen(false)} projectId={projectId} requestTypes={requestTypes} /> : null}
    <ConflictPanel conflicts={conflicts} />
    <RoadIntelligencePanel data={roadData} projectId={projectId} plannedStart={project.plannedStart} plannedEnd={project.plannedEnd} onAction={actOnRecommendation} />
    <section className="portal-panel"><dl className="detail-list"><div><dt>Project ID</dt><dd><code>{project.id}</code></dd></div><div><dt>Ticket</dt><dd>{project.ticket ? <Link href={`/project-head/tickets?ticket=${project.ticket.id}`}>{project.ticket.id}</Link> : "Standalone"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "—"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Response deadline</dt><dd>{project.action ? new Date(project.action.deadline).toLocaleString("en-IN") : "No pending response"}</dd></div><div><dt>Timeline</dt><dd>{project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Awaiting Engineer timeline"}</dd></div></dl></section>
    <section className="operations-section"><div className="zone-heading"><div><p className="eyebrow">Connected delivery</p><h2>Formal dependency flow</h2></div><span className="workflow-count">{dependencies.length} connected</span></div><div className="dependency-flow-grid">{dependencies.map((dependency) => <DependencyFlowCard dependency={dependency} direction="sent" key={dependency.id} projectHref={`/project-head/projects/${projectId}`}><NextActionButton href="/project-head/dependencies" secondary>Open coordination workspace</NextActionButton></DependencyFlowCard>)}{dependencies.length === 0 ? <div className="empty-state"><strong>No connected agencies yet.</strong><span>Coordinate with another agency when its work, evidence, or clearance is needed.</span></div> : null}</div></section>
  </>;
}
