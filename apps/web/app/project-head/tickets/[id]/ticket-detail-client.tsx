"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { ProjectHeadTicketDetail } from "@civicos/shared";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { apiFetch, evidenceContentType, uploadFile } from "../../_lib/api";

type UploadTarget = { uploadUrl: string; headers: Record<string, string> };

export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      setTicket((await apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`)).ticket);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load ticket");
    }
  }, [ticketId]);
  usePortalPolling(load);

  const completeInspection = async (event: FormEvent) => {
    event.preventDefault();
    if (!report) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await apiFetch<{ reportId: string; upload: UploadTarget }>(`/tickets/${ticketId}/inspection-report`, {
        method: "POST",
        body: JSON.stringify({ action: "presign", fileName: report.name, contentType: evidenceContentType(report), notes }),
      });
      await uploadFile(created.upload, report);
      await apiFetch(`/tickets/${ticketId}/inspection-report`, { method: "POST", body: JSON.stringify({ action: "complete", reportId: created.reportId }) });
      setNotes("");
      setReport(undefined);
      await load();
      notifyPortalDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete inspection");
    } finally {
      setBusy(false);
    }
  };

  if (!ticket && !error) return <p className="portal-muted">Loading ticket…</p>;
  if (!ticket) return <p className="error" role="alert">{error}</p>;
  const canInspect = ticket.internalState === "ROUTED_TO_AGENCY" || ticket.internalState === "INSPECTION_DUE";
  return (
    <>
      <header className="portal-heading detail-heading"><div><Link className="back-link" href="/project-head/tickets">← Ticket queue</Link><p className="eyebrow">{ticket.category.name} · {ticket.ward.name}</p><h1>{ticket.title}</h1><p>{ticket.description ?? ticket.address}</p></div><span className="state-chip due">{ticket.internalState.replaceAll("_", " ")}</span></header>
      <div className="detail-grid">
        <section className="portal-panel"><p className="eyebrow">Ticket record</p><dl className="detail-list"><div><dt>Ticket No.</dt><dd><code>{ticket.referenceNumber}</code></dd></div><div><dt>Origin</dt><dd>{ticket.reporterId ? "Citizen validated" : "Agency originated"}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Observations</dt><dd>{ticket.observationCount}</dd></div></dl>
          <h2>Evidence</h2><div className="evidence-list">{ticket.evidence.map((item) => <a href={item.url} key={item.id} target="_blank" rel="noreferrer">Open uploaded evidence ↗</a>)}</div>
          <h2>Suggested dependency agencies</h2><p className="portal-muted">Advisory only. Nothing is selected or created automatically.</p><div className="suggestion-list">{ticket.routingSuggestions.length ? ticket.routingSuggestions.map((agency) => <span key={agency.id}>{agency.name}</span>) : <span>No configured suggestions</span>}</div>
        </section>
        <aside>
          {canInspect ? <form className="portal-panel inspection-card" onSubmit={(event) => void completeInspection(event)}><p className="eyebrow">W-P4 · Inspection</p><h2>Complete field inspection</h2><label>Inspection notes<textarea required minLength={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Findings, measurements, urgency, and recommended action…" /></label><label className="portal-upload compact"><strong>{report?.name ?? "Attach report or photo"}</strong><input required type="file" accept="image/*,application/pdf" onChange={(event) => setReport(event.target.files?.[0])} /></label>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !report} type="submit">{busy ? "Completing…" : "Inspection Complete"}</button></form> : null}
          {ticket.internalState === "INSPECTION_COMPLETE" && !ticket.project ? <section className="portal-panel action-card"><p className="eyebrow">Ready for delivery</p><h2>Create project and coordinate</h2><p>Assign an Executive Engineer and add dependency agencies in the same guided workflow.</p><Link className="primary-link" href={`/project-head/projects?ticketId=${ticket.id}`}>Create Project + Add Dependency</Link></section> : null}
          {ticket.project ? <section className="portal-panel action-card"><p className="eyebrow">Project created</p><h2>{ticket.project.state.replaceAll("_", " ")}</h2>{ticket.project.state === "CREATED" ? <Link className="primary-link" href={`/project-head/projects?ticketId=${ticket.id}`}>Assign engineer and continue</Link> : <Link href={`/project-head/projects?project=${ticket.project.id}`}>Open project →</Link>}</section> : null}
        </aside>
      </div>
    </>
  );
}
