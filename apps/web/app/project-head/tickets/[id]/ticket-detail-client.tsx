"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { CitizenTicketTimelineResponse, ProjectHeadTicketDetail } from "@civicos/shared";
import { NextActionButton } from "../../../_components/operations";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { CompactAlert, RecordTabs, SectionHeader, ticketWorkStage, WorkLifecycle, WorkStatus } from "../../_components/work-ui";
import { apiFetch, evidenceContentType, uploadFile } from "../../_lib/api";

type UploadTarget = { uploadUrl: string; headers: Record<string, string> };
type RecordTab = "OVERVIEW" | "ACTIVITY" | "DOCUMENTS";

export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [timeline, setTimeline] = useState<CitizenTicketTimelineResponse>();
  const [tab, setTab] = useState<RecordTab>("OVERVIEW");
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [ticketResult, timelineResult] = await Promise.all([
        apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`),
        apiFetch<CitizenTicketTimelineResponse>(`/tickets/${ticketId}/timeline`),
      ]);
      setTicket(ticketResult.ticket);
      setTimeline(timelineResult);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this work record");
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

  const activity = useMemo(() => {
    if (!timeline) return [];
    return [
      ...timeline.timeline.map((event, index) => ({ id: `state-${index}-${new Date(event.at).getTime()}`, title: event.label, detail: "Workflow status recorded", at: event.at })),
      ...timeline.notes.map((note) => ({ id: note.id, title: note.label, detail: note.text, at: note.at })),
      ...timeline.grievances.map((grievance) => ({ id: grievance.id, title: `Citizen issue · ${grievance.status.replaceAll("_", " ").toLowerCase()}`, detail: grievance.note ?? grievance.reason.replaceAll("_", " ").toLowerCase(), at: grievance.createdAt })),
    ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
  }, [timeline]);

  if (!ticket && !error) return <p className="portal-muted">Loading work record…</p>;
  if (!ticket) return <p className="error" role="alert">{error}</p>;

  const canInspect = ticket.internalState === "ROUTED_TO_AGENCY" || ticket.internalState === "INSPECTION_DUE";
  const documents = ticket.evidence.length + ticket.inspectionReports.length;
  let primaryAction: ReactNode = null;
  let nextStep = "This issue is recorded and no Project Head action is currently required.";
  if (ticket.grievances.some((grievance) => grievance.status !== "RESOLVED")) {
    const grievance = ticket.grievances.find((item) => item.status !== "RESOLVED")!;
    nextStep = "A citizen issue is open on this record and requires review.";
    primaryAction = <NextActionButton href={`/project-head/grievances?grievance=${grievance.id}`}>Review issue</NextActionButton>;
  } else if (canInspect) {
    nextStep = "Complete the field inspection and attach the inspection report.";
    primaryAction = <NextActionButton href="#inspection">Inspect</NextActionButton>;
  } else if (ticket.internalState === "INSPECTION_COMPLETE" && !ticket.project) {
    nextStep = "Inspection is complete. Set up the civic work and assign an Executive Engineer.";
    primaryAction = <NextActionButton href={`/project-head/projects?ticketId=${ticket.id}`}>Create work</NextActionButton>;
  } else if (ticket.project) {
    nextStep = ticket.project.state === "CREATED" ? "The work record is ready for an Executive Engineer assignment." : "Continue delivery from the connected work record.";
    primaryAction = <NextActionButton href={ticket.project.state === "CREATED" ? `/project-head/projects?ticketId=${ticket.id}` : `/project-head/projects/${ticket.project.id}`}>{ticket.project.state === "CREATED" ? "Assign engineer" : "Open work"}</NextActionButton>;
  }

  return <div className="ph-record-page">
    <header className="ph-record-header"><div><Link className="back-link" href="/project-head/projects">← Back to Work</Link><h1>{ticket.title}</h1><p><code>{ticket.referenceNumber}</code> · {ticket.ward.name} · {ticket.category.name}</p></div><div className="ph-record-header-actions"><WorkStatus state={ticket.internalState} />{primaryAction}</div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <RecordTabs active={tab} onChange={setTab} tabs={[{ id: "OVERVIEW", label: "Overview" }, { id: "ACTIVITY", label: "Activity", count: activity.length }, { id: "DOCUMENTS", label: "Documents", count: documents }]} />

    {tab === "OVERVIEW" ? <div className="ph-record-section" role="tabpanel">
      <CompactAlert title="Next step" action={primaryAction}>{nextStep}</CompactAlert>
      <section className="ph-record-group"><SectionHeader title="Work progress" description="The operational lifecycle from report to closure." /><WorkLifecycle current={ticketWorkStage(ticket.internalState)} /></section>
      {canInspect ? <form className="ph-inspection-form" id="inspection" onSubmit={(event) => void completeInspection(event)}><SectionHeader title="Field inspection" description="Record findings and attach the supporting report or site photo." /><label>Inspection notes<textarea required minLength={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Findings, measurements, urgency, and recommended action…" /></label><label className="ph-file-input"><span>Inspection report or photo</span><input required type="file" accept="image/*,application/pdf" onChange={(event) => setReport(event.target.files?.[0])} /><small>{report?.name ?? "PDF or image"}</small></label><button className="portal-primary-button" disabled={busy || !report} type="submit">{busy ? "Completing…" : "Complete inspection"}</button></form> : null}
      <section className="ph-record-group"><SectionHeader title="Work details" /><dl className="ph-detail-grid"><div><dt>Location</dt><dd>{ticket.address}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Source</dt><dd>{ticket.reporterId ? "Citizen reported and validated" : "Agency originated"}</dd></div><div><dt>Observations</dt><dd>{ticket.observationCount}</dd></div><div><dt>Issue category</dt><dd>{ticket.category.name}</dd></div><div><dt>Responsible</dt><dd>{ticket.action?.responsibleUser.email ?? "Agency queue"}</dd></div></dl>{ticket.description ? <div className="ph-scope"><h3>Reported issue</h3><p>{ticket.description}</p></div> : null}</section>
      {ticket.routingSuggestions.length ? <section className="ph-record-group"><SectionHeader title="Coordination context" description="Configured routing suggestions are advisory; no dependency is created automatically." /><ul className="ph-simple-list">{ticket.routingSuggestions.map((agency) => <li key={agency.id}>{agency.name}<span>{agency.type}</span></li>)}</ul></section> : null}
      {ticket.grievances.length ? <section className="ph-record-group"><SectionHeader title="Citizen issues" /><ul className="ph-simple-list">{ticket.grievances.map((grievance) => <li key={grievance.id}><span><strong>{grievance.reason.replaceAll("_", " ").toLowerCase()}</strong><small>{new Date(grievance.createdAt).toLocaleDateString("en-IN")}</small></span><Link href={`/project-head/grievances?grievance=${grievance.id}`}>{grievance.status === "RESOLVED" ? "View resolution" : "Review issue"} →</Link></li>)}</ul></section> : null}
    </div> : null}

    {tab === "ACTIVITY" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Activity" description="Recorded workflow changes, inspection notes, field updates, and citizen issues." />{activity.length ? <ol className="ph-activity-log">{activity.map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{event.title}</strong><p>{event.detail}</p><time>{new Date(event.at).toLocaleString("en-IN")}</time></div></li>)}</ol> : <p className="portal-muted">No activity has been recorded yet.</p>}</section> : null}

    {tab === "DOCUMENTS" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Documents and evidence" description="Citizen evidence and completed inspection reports attached to this record." />{documents ? <div className="ph-document-list">{ticket.evidence.map((item, index) => <a href={item.url} key={item.id} rel="noreferrer" target="_blank"><span><strong>Reported evidence {index + 1}</strong><small>{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString("en-IN") : "Uploaded evidence"}</small></span><span>Open ↗</span></a>)}{ticket.inspectionReports.map((item, index) => <a href={item.fileUrl} key={item.id} rel="noreferrer" target="_blank"><span><strong>Inspection report {index + 1}</strong><small>{item.notes ?? item.contentType}</small></span><span>Open ↗</span></a>)}</div> : <p className="portal-muted">No documents are available on this record.</p>}</section> : null}
  </div>;
}
