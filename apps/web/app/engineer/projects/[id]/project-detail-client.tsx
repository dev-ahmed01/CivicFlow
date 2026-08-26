"use client";

import type { EngineerProjectDetail, ProjectConflict } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { ConflictIndicator } from "../../../_components/operations";
import { PortalStatePill } from "../../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { apiFetch, completionContentType, uploadFile } from "../../_lib/api";

function dateInput(value: string | Date | null, fallbackDays: number): string {
  return value ? new Date(value).toISOString().slice(0, 10) : new Date(Date.now() + fallbackDays * 86_400_000).toISOString().slice(0, 10);
}

function ConflictPanel({ conflicts }: { conflicts: ProjectConflict[] }) {
  if (conflicts.length === 0) return null;
  return <section aria-labelledby="engineer-conflict-title" className="portal-panel conflict-panel"><div className="panel-title-row"><div><p className="eyebrow">Advisory coordination check</p><h2 id="engineer-conflict-title">Timeline coordination</h2></div><ConflictIndicator count={conflicts.length} /></div><p>Warnings never block editing or saving. Coordinate with the listed agency as needed.</p><div className="conflict-list">{conflicts.map((conflict) => <article className={`conflict-item ${conflict.severity === "PROMINENT" ? "prominent" : "inline"}`} key={conflict.id}><div><strong>{conflict.conflictingProjectName}</strong><span className="conflict-severity">{conflict.severity === "PROMINENT" ? "Prominent warning" : "Inline note"}</span></div><p>{conflict.conflictingAgency.name}</p><dl><div><dt>Overlap</dt><dd>{new Date(conflict.overlapStart).toLocaleDateString("en-IN")} – {new Date(conflict.overlapEnd).toLocaleDateString("en-IN")}</dd></div><div><dt>Location</dt><dd>{conflict.locationDescription}</dd></div></dl><small>{conflict.reason}</small></article>)}</div></section>;
}

export function EngineerProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [flags, setFlags] = useState("");
  const [note, setNote] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionFile, setCompletionFile] = useState<File>();
  const initializedProjectId = useRef<string>();

  const load = useCallback(async () => {
    try {
      const [projectResult, conflictResult] = await Promise.all([
        apiFetch<{ project: EngineerProjectDetail }>(`/projects/${projectId}`),
        apiFetch<{ conflicts: ProjectConflict[] }>(`/projects/${projectId}/conflicts`),
      ]);
      setProject(projectResult.project);
      setConflicts(conflictResult.conflicts);
      if (initializedProjectId.current !== projectResult.project.id) {
        setStart(dateInput(projectResult.project.plannedStart, 0));
        setEnd(dateInput(projectResult.project.plannedEnd, 7));
        setDescription(projectResult.project.workDescription ?? "");
        setFlags(projectResult.project.dependencyFlags.join(", "));
        initializedProjectId.current = projectResult.project.id;
      }
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load project");
    }
  }, [projectId]);
  usePortalPolling(load);

  const mutate = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await work();
      notifyPortalDataChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update project");
    } finally {
      setBusy(false);
    }
  };

  const saveTimeline = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() => apiFetch(`/projects/${projectId}/timeline`, { method: "PATCH", body: JSON.stringify({ plannedStart: `${start}T00:00:00.000Z`, plannedEnd: `${end}T23:59:59.999Z`, workDescription: description, dependencyFlags: flags.split(",").map((item) => item.trim()).filter(Boolean) }) }));
  };
  const addNote = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await apiFetch(`/projects/${projectId}/status`, { method: "PATCH", body: JSON.stringify({ note }) });
      setNote("");
    });
  };
  const submitCompletion = (event: FormEvent) => {
    event.preventDefault();
    if (!completionFile) return;
    void mutate(async () => {
      const target = await apiFetch<{ evidenceId: string; upload: { uploadUrl: string; headers: Record<string, string> } }>(`/projects/${projectId}/completion`, { method: "POST", body: JSON.stringify({ fileName: completionFile.name, action: "presign", contentType: completionContentType(completionFile), notes: completionNotes }) });
      await uploadFile(target.upload, completionFile);
      await apiFetch(`/projects/${projectId}/completion`, { method: "POST", body: JSON.stringify({ action: "complete", evidenceId: target.evidenceId }) });
      setCompletionFile(undefined);
      setCompletionNotes("");
    });
  };

  if (!project && !error) return <p className="portal-muted">Loading project…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;
  const canEditTimeline = project.editable && ["UPTAKEN", "ACTIVE", "MODIFIED"].includes(project.state);

  return <>
    <header className="portal-heading detail-heading"><div><Link className="back-link" href="/engineer/projects">← Projects</Link><p className="eyebrow">{project.editable ? "Owned project" : "Geographic project · Read-only"}</p><h1>{project.ticket?.title ?? "Project record"}</h1><p>{project.agency.name} · {project.ticket?.ward.name ?? "Ward unavailable"}</p></div><PortalStatePill state={project.state} /></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!project.editable ? <p className="read-only-banner">You may view this project for area coordination. Only its assigned Engineer can edit it.</p> : null}
    <ConflictPanel conflicts={conflicts} />
    <div className="engineer-detail-grid"><div>
      <section className="portal-panel"><p className="eyebrow">Ticket context</p><h2>{project.ticket?.category.name ?? "Category unavailable"}</h2><dl className="detail-list"><div><dt>Address</dt><dd>{project.ticket?.address ?? "—"}</dd></div><div><dt>Ticket state</dt><dd>{project.ticket?.state.replaceAll("_", " ") ?? "—"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div></dl></section>
      <section className="portal-panel engineer-section"><p className="eyebrow">Inspection</p><h2>Inspection report</h2>{project.ticket?.inspectionReports.length ? project.ticket.inspectionReports.map((report) => <article className="evidence-row" key={report.id}><p>{report.notes}</p><a href={report.fileUrl} rel="noreferrer" target="_blank">Open evidence</a></article>) : <p className="portal-muted">No uploaded inspection report.</p>}</section>
      <section className="portal-panel engineer-section"><div className="panel-title-row"><div><p className="eyebrow">Connected delivery</p><h2>Dependencies</h2></div><Link href="/engineer/dependencies">Open dependency workspace →</Link></div>{project.dependencies.length ? <div className="project-dependency-links">{project.dependencies.map((dependency) => <article key={dependency.id}><div className="dependency-connection"><div><small>Primary agency</small><strong>{project.agency.name}</strong></div><span aria-hidden="true">↔</span><div><small>Dependency agency</small><strong>{dependency.respondingAgency.name}</strong></div></div><p>{dependency.requirement}</p><PortalStatePill state={dependency.state} /></article>)}</div> : <p className="portal-muted">No dependencies recorded.</p>}</section>
    </div><aside>
      {project.editable && project.state === "PENDING_UPTAKE" ? <section className="portal-panel action-card"><p className="eyebrow">Work request</p><h2>Accept this project?</h2><p>Review the ticket, inspection, and dependency context before uptake.</p><button className="engineer-primary" disabled={busy} type="button" onClick={() => void mutate(() => apiFetch(`/projects/${projectId}/uptake`, { method: "POST" }))}>Accept Project</button></section> : null}
      {canEditTimeline ? <form className="portal-panel engineer-form action-anchor" id="execution" onSubmit={saveTimeline}><p className="eyebrow">Execution details</p><h2>{project.state === "UPTAKEN" ? "Set timeline" : "Update timeline"}</h2><label>Start date<input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End date<input type="date" required value={end} onChange={(event) => setEnd(event.target.value)} /></label><label>Work description<textarea required minLength={10} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Dependency flags<input value={flags} onChange={(event) => setFlags(event.target.value)} placeholder="Comma-separated flags" /></label><small>Saving runs the advisory conflict check; warnings never block progress.</small><button className="engineer-primary" disabled={busy} type="submit">Save Timeline</button></form> : null}
      {project.editable && project.state === "ACTIVE" ? <><form className="portal-panel engineer-form action-anchor" id="updates" onSubmit={addNote}><p className="eyebrow">Field update</p><h2>Add Update</h2><textarea required minLength={3} value={note} onChange={(event) => setNote(event.target.value)} /><button className="engineer-secondary" disabled={busy} type="submit">Add Update</button></form><section className="portal-panel action-card action-anchor" id="completion"><p className="eyebrow">Status update</p><h2>Work finished?</h2><button className="engineer-primary" disabled={busy} type="button" onClick={() => void mutate(() => apiFetch(`/projects/${projectId}/status`, { method: "PATCH", body: JSON.stringify({ state: "COMPLETED" }) }))}>Mark Complete</button></section></> : null}
      {project.editable && project.state === "COMPLETED" ? <form className="portal-panel engineer-form action-anchor" id="completion" onSubmit={submitCompletion}><p className="eyebrow">Completion evidence</p><h2>Submit Evidence</h2><label>Completion photo<input accept="image/jpeg,image/png,image/webp,image/heic" required type="file" onChange={(event) => setCompletionFile(event.target.files?.[0])} /></label><label>Notes<textarea required minLength={3} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} /></label><button className="engineer-primary" disabled={busy || !completionFile} type="submit">Submit Evidence</button></form> : null}
      {project.state === "AWAITING_VERIFICATION" ? <section className="portal-panel verification-wait action-anchor" id="verification"><p className="eyebrow">Citizen verification</p><h2>Awaiting Verification</h2><p>Completion evidence has been sent to the original validators. This view will update automatically when quorum is reached.</p>{project.completionEvidence.map((evidence) => <a href={evidence.photoUrl} key={evidence.id} rel="noreferrer" target="_blank">View submitted evidence →</a>)}</section> : null}
      <section className="portal-panel state-history"><p className="eyebrow">State history</p>{project.stateTransitions.map((transition) => <div key={transition.id}><strong>{transition.toState.replaceAll("_", " ")}</strong><small>{new Date(transition.createdAt).toLocaleString("en-IN")}</small></div>)}</section>
    </aside></div>
  </>;
}
