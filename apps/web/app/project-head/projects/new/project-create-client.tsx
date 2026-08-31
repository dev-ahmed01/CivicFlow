"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Agency, EngineerSummary, InterventionPurpose, Project, ProjectHeadTicketDetail, RoadInterventionHistoryItem, RoadSegmentSummary } from "@civicos/shared";
import { notifyPortalDataChanged } from "../../../_lib/portal-refresh";
import { apiFetch, getSession } from "../../_lib/api";

export function ProjectCreateClient({ ticketId, onCreated }: { ticketId: string; onCreated?: (project: Project) => void }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [dependencyNeeds, setDependencyNeeds] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Project>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [roadCategoryId, setRoadCategoryId] = useState<string>();
  const [segments, setSegments] = useState<RoadSegmentSummary[]>([]);
  const [history, setHistory] = useState<RoadInterventionHistoryItem[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [purpose, setPurpose] = useState<InterventionPurpose>("other");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [affectedLengthM, setAffectedLengthM] = useState("100");
  const [startOffsetM, setStartOffsetM] = useState("0");
  const [interventionDependencyRefs, setInterventionDependencyRefs] = useState<string[]>([]);

  useEffect(() => {
    if (!ticketId) { setError("Choose an inspected ticket before creating a project"); return; }
    void Promise.all([
      apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`),
      apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
      apiFetch<{ agencies: Agency[] }>("/agencies"),
      apiFetch<{ categories: Array<{ id: string; roadIntelligenceEnabled: boolean }> }>("/categories"),
    ]).then(([ticketResult, engineerResult, agencyResult, categoryResult]) => {
      setTicket(ticketResult.ticket);
      setEngineers(engineerResult.engineers);
      setAgencies(agencyResult.agencies.filter((agency) => agency.id !== getSession()?.user.agencyId));
      setRoadCategoryId(categoryResult.categories.find((category) => category.roadIntelligenceEnabled)?.id);
      const draft = ticketResult.ticket.project?.intervention;
      if (draft) {
        setSegmentId(draft.segmentId);
        setPurpose(draft.purpose);
        setPlannedStart(new Date(draft.plannedStart).toISOString().slice(0, 10));
        setPlannedEnd(new Date(draft.plannedEnd).toISOString().slice(0, 10));
        setAffectedLengthM(String(draft.affectedLengthM));
        setStartOffsetM(String(draft.startOffsetM));
        setInterventionDependencyRefs(draft.dependencyRefs);
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load project review"));
  }, [ticketId]);

  const roadEnabled = Boolean(ticket && roadCategoryId === ticket.category.id);
  useEffect(() => {
    if (!roadEnabled || !ticket) return;
    void apiFetch<{ segments: RoadSegmentSummary[] }>(`/road-segments?ward=${ticket.ward.id}`).then((result) => setSegments(result.segments));
  }, [roadEnabled, ticket]);
  useEffect(() => {
    if (!segmentId) { setHistory([]); return; }
    void apiFetch<{ interventionHistory: RoadInterventionHistoryItem[] }>(`/road-segments/${segmentId}`).then((result) => setHistory(result.interventionHistory));
  }, [segmentId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const dependencies = Object.entries(dependencyNeeds).map(([respondingAgencyId, requirement]) => ({ respondingAgencyId, requirement }));
      const intervention = roadEnabled ? { segmentId, purpose, plannedStart: `${plannedStart}T00:00:00.000Z`, plannedEnd: `${plannedEnd}T23:59:59.999Z`, affectedLengthM: Number(affectedLengthM), startOffsetM: Number(startOffsetM), dependencyRefs: interventionDependencyRefs } : undefined;
      const result = await apiFetch<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ ticketId, engineerId, dependencies, intervention }) });
      setCreated(result.project);
      notifyPortalDataChanged();
      onCreated?.(result.project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  };

  if (created) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><h1>Work created and assigned</h1><p>The engineer assignment is recorded. Any road warnings remain advisory, and formal agency requests are available in Coordination.</p><code>{created.referenceNumber}</code><div><Link className="primary-link" href={`/project-head/projects/${created.id}`}>Open work</Link><Link className="secondary-link" href="/project-head/dependencies">Open coordination</Link></div></section>;
  const suggestedIds = new Set(ticket?.routingSuggestions.map((agency) => agency.id) ?? []);
  const dependencyInputsValid = Object.values(dependencyNeeds).every((requirement) => requirement.trim().length >= 10);
  const validState = ticket && ["INSPECTION_COMPLETE", "PROJECT_CREATED"].includes(ticket.internalState);

  return <><header className="portal-heading"><div><p className="eyebrow">W-P6 · Create project</p><h1>Review and assign</h1><p>Confirm the inspected work and choose an Executive Engineer from your agency roster.</p></div></header><form className="project-create-flow" onSubmit={(event) => void submit(event)}>
    <div className="review-grid"><section className="portal-panel"><p className="eyebrow">Inspected ticket</p><h2>{ticket?.title ?? "Loading ticket…"}</h2>{ticket ? <dl className="detail-list"><div><dt>Ticket</dt><dd><code>{ticket.id}</code></dd></div><div><dt>Category</dt><dd>{ticket.category.name}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Status</dt><dd>{ticket.internalState.replaceAll("_", " ")}</dd></div></dl> : null}</section><section className="portal-panel assignment-card"><p className="eyebrow">Agency roster</p><h2>Assign Executive Engineer</h2><label>Engineer<select required value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><p className="portal-muted">Only engineers belonging to your agency are accepted by the server.</p></section></div>
    {roadEnabled ? <section className="portal-panel road-assessment"><p className="eyebrow">Phase 8 · Exact segment</p><h2>Road intervention details</h2><p className="portal-muted">The Project timeline mirrors these dates. Existing segment work can be declared as a dependency; nothing is inferred automatically.</p><div className="two-column"><label>Road segment<select required value={segmentId} onChange={(event) => { setSegmentId(event.target.value); setInterventionDependencyRefs([]); }}><option value="">Choose segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.roadName} · {segment.ward.name}</option>)}</select></label><label>Purpose<select required value={purpose} onChange={(event) => setPurpose(event.target.value as InterventionPurpose)}>{(["pipeline", "cable", "OFC", "resurfacing", "other"] satisfies InterventionPurpose[]).map((item) => <option key={item}>{item}</option>)}</select></label><label>Planned start<input required type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} /></label><label>Planned end<input required min={plannedStart} type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></label><label>Start offset (m)<input required min="0" type="number" value={startOffsetM} onChange={(event) => setStartOffsetM(event.target.value)} /></label><label>Affected length (m)<input required min="1" type="number" value={affectedLengthM} onChange={(event) => setAffectedLengthM(event.target.value)} /></label></div>{history.length ? <fieldset className="intervention-dependencies"><legend>Declared dependencies on this segment</legend>{history.filter((item) => item.projectId !== ticket?.project?.id).map((item) => <label key={item.id}><input type="checkbox" checked={interventionDependencyRefs.includes(item.id)} onChange={(event) => setInterventionDependencyRefs((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.requestingAgency.name} · {item.purpose}</label>)}</fieldset> : null}</section> : null}
    <section className="portal-panel dependency-assessment"><div className="assessment-heading"><div><p className="eyebrow">W-P5 · Dependency assessment</p><h2>Does another agency need to coordinate?</h2><p className="portal-muted">Suggestions come from the routing table. They are advisory and remain unselected until you choose them.</p></div><span>{Object.keys(dependencyNeeds).length} selected</span></div><div className="agency-choice-grid">{agencies.map((agency) => { const selected = agency.id in dependencyNeeds; return <div className={selected ? "agency-choice selected" : "agency-choice"} key={agency.id}><label><input type="checkbox" checked={selected} onChange={(event) => setDependencyNeeds((current) => { const next = { ...current }; if (event.target.checked) next[agency.id] = ""; else delete next[agency.id]; return next; })} /><span><strong>{agency.name}</strong><small>{agency.type}</small></span>{suggestedIds.has(agency.id) ? <em>Suggested</em> : null}</label>{selected ? <textarea aria-label={`Statement of need for ${agency.name}`} required minLength={10} value={dependencyNeeds[agency.id]} onChange={(event) => setDependencyNeeds({ ...dependencyNeeds, [agency.id]: event.target.value })} placeholder={`What does ${agency.name} need to provide?`} /> : null}</div>; })}</div></section>
    <section className="project-create-submit"><div><strong>48-hour response window</strong><span>Each selected agency receives its own statement of need and deadline.</span></div>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !validState || !engineerId || !dependencyInputsValid || (roadEnabled && (!segmentId || !plannedStart || !plannedEnd))} type="submit">{busy ? "Creating…" : "Assign engineer and create work"}</button></section>
  </form></>;
}
