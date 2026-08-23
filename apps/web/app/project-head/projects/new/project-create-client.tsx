"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Agency, EngineerSummary, Project, ProjectHeadTicketDetail } from "@civicos/shared";
import { apiFetch, getSession } from "../../_lib/api";

export function ProjectCreateClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [dependencyNeeds, setDependencyNeeds] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Project>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!ticketId) { setError("Choose an inspected ticket before creating a project"); return; }
    void Promise.all([
      apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`),
      apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
      apiFetch<{ agencies: Agency[] }>("/agencies"),
    ]).then(([ticketResult, engineerResult, agencyResult]) => {
      setTicket(ticketResult.ticket);
      setEngineers(engineerResult.engineers);
      setAgencies(agencyResult.agencies.filter((agency) => agency.id !== getSession()?.user.agencyId));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load project review"));
  }, [ticketId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const dependencies = Object.entries(dependencyNeeds).map(([respondingAgencyId, requirement]) => ({ respondingAgencyId, requirement }));
      const result = await apiFetch<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ ticketId, engineerId, dependencies }) });
      setCreated(result.project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  };

  if (created) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><p className="eyebrow">Engineer assigned</p><h1>Project created</h1><p>The ticket is now in ENGINEER ASSIGNED. Any dependency requests are waiting in the target agencies’ inboxes.</p><code>{created.id}</code><div><Link className="primary-link" href="/project-head/projects">View projects</Link><Link className="secondary-link" href="/project-head/dependencies/outbox">Dependency outbox</Link></div></section>;
  const suggestedIds = new Set(ticket?.routingSuggestions.map((agency) => agency.id) ?? []);
  const dependencyInputsValid = Object.values(dependencyNeeds).every((requirement) => requirement.trim().length >= 10);
  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">W-P6 · Create project</p><h1>Review and assign</h1><p>Confirm the inspected work and choose an Executive Engineer from your agency roster.</p></div></header>
      <form className="project-create-flow" onSubmit={(event) => void submit(event)}>
        <div className="review-grid">
        <section className="portal-panel"><p className="eyebrow">Inspected ticket</p><h2>{ticket?.title ?? "Loading ticket…"}</h2>{ticket ? <dl className="detail-list"><div><dt>Ticket</dt><dd><code>{ticket.id}</code></dd></div><div><dt>Category</dt><dd>{ticket.category.name}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Status</dt><dd>{ticket.internalState.replaceAll("_", " ")}</dd></div></dl> : null}</section>
        <section className="portal-panel assignment-card"><p className="eyebrow">Agency roster</p><h2>Assign Executive Engineer</h2><label>Engineer<select required value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><p className="portal-muted">Only engineers belonging to your agency are accepted by the server.</p></section>
        </div>
        <section className="portal-panel dependency-assessment"><div className="assessment-heading"><div><p className="eyebrow">W-P5 · Dependency assessment</p><h2>Does another agency need to coordinate?</h2><p className="portal-muted">Suggestions come from the routing table. They are advisory and remain unselected until you choose them.</p></div><span>{Object.keys(dependencyNeeds).length} selected</span></div><div className="agency-choice-grid">{agencies.map((agency) => { const selected = agency.id in dependencyNeeds; return <div className={selected ? "agency-choice selected" : "agency-choice"} key={agency.id}><label><input type="checkbox" checked={selected} onChange={(event) => setDependencyNeeds((current) => { const next = { ...current }; if (event.target.checked) next[agency.id] = ""; else delete next[agency.id]; return next; })} /><span><strong>{agency.name}</strong><small>{agency.type}</small></span>{suggestedIds.has(agency.id) ? <em>Suggested</em> : null}</label>{selected ? <textarea aria-label={`Statement of need for ${agency.name}`} required minLength={10} value={dependencyNeeds[agency.id]} onChange={(event) => setDependencyNeeds({ ...dependencyNeeds, [agency.id]: event.target.value })} placeholder={`What does ${agency.name} need to provide?`} /> : null}</div>; })}</div></section>
        <section className="project-create-submit"><div><strong>48-hour response window</strong><span>Each selected agency receives its own statement of need and deadline.</span></div>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !ticket || ticket.internalState !== "INSPECTION_COMPLETE" || !engineerId || !dependencyInputsValid} type="submit">{busy ? "Creating…" : "Create project and send requests"}</button></section>
      </form>
    </>
  );
}
