"use client";

import type { Agency, DependencyListItem, EngineerProjectDetail, ProjectConflict, SequencingRecommendationOutcome } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { ConflictIndicator, DependencyFlowCard, NextActionButton } from "../../../_components/operations";
import { RoadIntelligencePanel, type RoadIntelligenceData } from "../../../_components/road-intelligence-panel";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { apiFetch } from "../../_lib/api";

const emptyRoadData: RoadIntelligenceData = { conflicts: [], recommendations: [], segment: null, interventionHistory: [] };

function ConflictPanel({ conflicts }: { conflicts: ProjectConflict[] }) {
  if (conflicts.length === 0) return null;
  return <section aria-labelledby="conflict-panel-title" className="portal-panel conflict-panel"><div className="panel-title-row"><div><p className="eyebrow">Advisory coordination check</p><h2 id="conflict-panel-title">Timeline coordination</h2></div><ConflictIndicator count={conflicts.length} /></div><p>Warnings remain advisory and never block saving or delivery.</p><div className="conflict-list">{conflicts.map((conflict) => <article className={`conflict-item ${conflict.severity === "PROMINENT" ? "prominent" : "inline"}`} key={conflict.id}><div><strong>{conflict.conflictingProjectName}</strong><span className="conflict-severity">{conflict.severity === "PROMINENT" ? "Prominent warning" : "Inline note"}</span></div><p>{conflict.conflictingAgency.name}</p><dl><div><dt>Overlap</dt><dd>{new Date(conflict.overlapStart).toLocaleDateString("en-IN")} – {new Date(conflict.overlapEnd).toLocaleDateString("en-IN")}</dd></div><div><dt>Location</dt><dd>{conflict.locationDescription}</dd></div></dl><small>{conflict.reason}</small></article>)}</div></section>;
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [roadData, setRoadData] = useState<RoadIntelligenceData>(emptyRoadData);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [dependencyOpen, setDependencyOpen] = useState(false);
  const [respondingAgencyId, setRespondingAgencyId] = useState("");
  const [requirement, setRequirement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [projectResult, conflictResult, roadResult, dependencyResult, agencyResult] = await Promise.all([
        apiFetch<{ project: EngineerProjectDetail }>(`/projects/${projectId}`),
        apiFetch<{ conflicts: ProjectConflict[] }>(`/projects/${projectId}/conflicts`),
        apiFetch<RoadIntelligenceData>(`/projects/${projectId}/road-intelligence`),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=sent"),
        apiFetch<{ agencies: Agency[] }>("/agencies"),
      ]);
      setProject(projectResult.project);
      setConflicts(conflictResult.conflicts);
      setRoadData(roadResult);
      setDependencies(dependencyResult.dependencies.filter((dependency) => dependency.projectId === projectId));
      setAgencies(agencyResult.agencies);
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

  const addDependency = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/projects/${projectId}/dependencies`, { method: "POST", body: JSON.stringify({ dependencies: [{ respondingAgencyId, requirement }] }) });
      setRespondingAgencyId("");
      setRequirement("");
      setDependencyOpen(false);
      notifyPortalDataChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send dependency request");
    } finally {
      setBusy(false);
    }
  };

  if (!project && !error) return <p className="portal-muted">Loading project…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;
  const unavailableAgencyIds = new Set([project.agencyId, ...dependencies.map(({ respondingAgencyId: id }) => id)]);
  const availableAgencies = agencies.filter((agency) => !unavailableAgencyIds.has(agency.id));

  return <>
    <header className="portal-heading"><div><Link className="back-link" href="/project-head/projects">← Projects</Link><p className="eyebrow">Agency project</p><h1>{project.ticket?.title ?? "Project record"}</h1><p>Created {new Date(project.createdAt).toLocaleDateString("en-IN")}</p></div><div className="heading-actions"><span className="state-chip">{project.state.replaceAll("_", " ")}</span><NextActionButton onClick={() => setDependencyOpen((open) => !open)}>Add Dependency</NextActionButton></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {project.grievance ? <section className="portal-panel grievance-card-escalated"><p className="eyebrow">Linked grievance · {project.grievance.status.replaceAll("_", " ")}</p><h2>{project.grievance.reason.replaceAll("_", " ")}</h2><p>Created {new Date(project.grievance.createdAt).toLocaleDateString("en-IN")}</p><NextActionButton href={`/project-head/grievances?grievance=${project.grievance.id}`}>Review Grievance</NextActionButton></section> : null}
    {dependencyOpen ? <form className="portal-panel dependency-composer" onSubmit={(event) => void addDependency(event)}><div><p className="eyebrow">Connected agency request</p><h2>Send Dependency Request</h2><p>Select the required agency and describe the exact work needed for this project.</p></div><label>Dependency agency<select required value={respondingAgencyId} onChange={(event) => setRespondingAgencyId(event.target.value)}><option value="">Choose agency</option>{availableAgencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name} · {agency.type}</option>)}</select></label><label>Requirement<textarea minLength={10} required value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="Describe the coordination, clearance, material, or field work required…" /></label><button className="portal-primary-button" disabled={busy || !respondingAgencyId || requirement.trim().length < 10} type="submit">{busy ? "Sending…" : "Send Dependency Request"}</button></form> : null}
    <ConflictPanel conflicts={conflicts} />
    <RoadIntelligencePanel data={roadData} projectId={projectId} plannedStart={project.plannedStart} plannedEnd={project.plannedEnd} onAction={actOnRecommendation} />
    <section className="portal-panel"><dl className="detail-list"><div><dt>Project ID</dt><dd><code>{project.id}</code></dd></div><div><dt>Ticket</dt><dd>{project.ticket ? <Link href={`/project-head/tickets?ticket=${project.ticket.id}`}>{project.ticket.id}</Link> : "Standalone"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "—"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Response deadline</dt><dd>{project.action ? new Date(project.action.deadline).toLocaleString("en-IN") : "No pending response"}</dd></div><div><dt>Timeline</dt><dd>{project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Awaiting Engineer timeline"}</dd></div></dl></section>
    <section className="operations-section"><div className="zone-heading"><div><p className="eyebrow">Connected delivery</p><h2>Dependency flow</h2></div><span className="workflow-count">{dependencies.length} connected</span></div><div className="dependency-flow-grid">{dependencies.map((dependency) => <DependencyFlowCard dependency={dependency} direction="sent" key={dependency.id} projectHref={`/project-head/projects/${projectId}`}><NextActionButton href="/project-head/dependencies/outbox" secondary>Review Dependency</NextActionButton></DependencyFlowCard>)}{dependencies.length === 0 ? <div className="empty-state"><strong>No connected agencies yet.</strong><span>Add a dependency when another department must coordinate on this project.</span></div> : null}</div></section>
  </>;
}
