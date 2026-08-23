"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { EngineerSummary, Project, ProjectHeadTicketDetail } from "@civicos/shared";
import { apiFetch } from "../../_lib/api";

export function ProjectCreateClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [created, setCreated] = useState<Project>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!ticketId) { setError("Choose an inspected ticket before creating a project"); return; }
    void Promise.all([
      apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`),
      apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
    ]).then(([ticketResult, engineerResult]) => { setTicket(ticketResult.ticket); setEngineers(engineerResult.engineers); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load project review"));
  }, [ticketId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await apiFetch<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ ticketId, engineerId }) });
      setCreated(result.project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  };

  if (created) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><p className="eyebrow">Engineer assigned</p><h1>Project created</h1><p>The ticket is now in ENGINEER ASSIGNED. The project remains CREATED until the Engineer accepts it in Phase 6.</p><code>{created.id}</code><Link className="primary-link" href="/project-head/projects">View projects</Link></section>;
  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">W-P6 · Create project</p><h1>Review and assign</h1><p>Confirm the inspected work and choose an Executive Engineer from your agency roster.</p></div></header>
      <form className="review-grid" onSubmit={(event) => void submit(event)}>
        <section className="portal-panel"><p className="eyebrow">Inspected ticket</p><h2>{ticket?.title ?? "Loading ticket…"}</h2>{ticket ? <dl className="detail-list"><div><dt>Ticket</dt><dd><code>{ticket.id}</code></dd></div><div><dt>Category</dt><dd>{ticket.category.name}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Status</dt><dd>{ticket.internalState.replaceAll("_", " ")}</dd></div></dl> : null}</section>
        <section className="portal-panel assignment-card"><p className="eyebrow">Agency roster</p><h2>Assign Executive Engineer</h2><label>Engineer<select required value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><p className="portal-muted">Only engineers belonging to your agency are accepted by the server.</p>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !ticket || ticket.internalState !== "INSPECTION_COMPLETE"} type="submit">{busy ? "Creating…" : "Create project and assign"}</button></section>
      </form>
    </>
  );
}
