"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { CitizenTicketTimelineResponse, EngineerSummary, InspectionReviewDecision, ProjectHeadTicketDetail } from "@civicos/shared";
import { NextActionButton } from "../../../_components/operations";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { CompactAlert, RecordTabs, SectionHeader, ticketWorkStage, WorkLifecycle, WorkStatus } from "../../_components/work-ui";
import { apiFetch } from "../../_lib/api";

type RecordTab = "OVERVIEW" | "ACTIVITY" | "DOCUMENTS";

export function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [timeline, setTimeline] = useState<CitizenTicketTimelineResponse>();
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [tab, setTab] = useState<RecordTab>("OVERVIEW");
  const [engineerId, setEngineerId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [ticketResult, timelineResult, engineerResult] = await Promise.all([
        apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${ticketId}`),
        apiFetch<CitizenTicketTimelineResponse>(`/tickets/${ticketId}/timeline`),
        apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
      ]);
      setTicket(ticketResult.ticket);
      setTimeline(timelineResult);
      setEngineers(engineerResult.engineers);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this work record");
    }
  }, [ticketId]);
  usePortalPolling(load);

  const assignInspection = async (event: FormEvent) => {
    event.preventDefault();
    if (!engineerId || !deadline) return;
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/tickets/${ticketId}/inspections`, { method: "POST", body: JSON.stringify({ engineerId, deadline: new Date(`${deadline}T17:00:00+05:30`).toISOString() }) });
      setEngineerId("");
      setDeadline("");
      notifyPortalDataChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not assign inspection");
    } finally {
      setBusy(false);
    }
  };

  const reviewInspection = async (inspectionId: string, decision: InspectionReviewDecision) => {
    if (!reviewNote.trim()) { setError("Add a review note before recording the decision"); return; }
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/inspections/${inspectionId}/review`, { method: "POST", body: JSON.stringify({ decision, note: reviewNote, ...(decision === "ADDITIONAL_INSPECTION" ? { engineerId, deadline: new Date(`${deadline}T17:00:00+05:30`).toISOString() } : {}) }) });
      setReviewNote("");
      notifyPortalDataChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review inspection");
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

  const activeInspection = ticket.inspectionReports.find((inspection) => ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(inspection.status));
  const submittedInspection = ticket.inspectionReports.find((inspection) => inspection.status === "SUBMITTED");
  const canAssignInspection = ["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(ticket.internalState) && !activeInspection;
  const documents = ticket.evidence.length + ticket.inspectionReports.reduce((total, inspection) => total + inspection.evidence.length + Number(Boolean(inspection.fileUrl)), 0);
  let primaryAction: ReactNode = null;
  let nextStep = "This issue is recorded and no Project Head action is currently required.";

  const grievance = ticket.grievances.find((item) => item.status !== "RESOLVED");
  if (grievance) {
    nextStep = "A citizen issue is open on this record and requires review.";
    primaryAction = <NextActionButton href={`/project-head/grievances?grievance=${grievance.id}`}>Review issue</NextActionButton>;
  } else if (submittedInspection) {
    nextStep = "The assigned Engineer submitted structured findings. Review the recommendation and decide what happens next.";
    primaryAction = <span className="ph-inline-actions"><NextActionButton href="#inspection-review">Review Inspection</NextActionButton><button className="ph-secondary-button" disabled={busy} onClick={() => void reviewInspection(submittedInspection.id, "ADDITIONAL_INSPECTION")} type="button">Request Additional Inspection</button></span>;
  } else if (canAssignInspection) {
    nextStep = "Choose an Executive Engineer from your agency to perform the site inspection.";
    primaryAction = <NextActionButton href="#inspection-assignment">Assign Inspection</NextActionButton>;
  } else if (activeInspection) {
    nextStep = `${activeInspection.assignedEngineer.email ?? "The assigned Engineer"} owns this field inspection. Its status is ${activeInspection.status.replaceAll("_", " ").toLowerCase()}.`;
  } else if (ticket.internalState === "INSPECTION_COMPLETE" && !ticket.project) {
    nextStep = "The reviewed inspection supports civic work creation and Engineer assignment.";
    primaryAction = <NextActionButton href={`/project-head/projects?ticketId=${ticket.id}`}>Create Civic Work</NextActionButton>;
  } else if (ticket.project) {
    nextStep = ticket.project.state === "CREATED" ? "The work is ready for an Executive Engineer assignment." : "Continue delivery from the connected work record.";
    primaryAction = <NextActionButton href={ticket.project.state === "CREATED" ? `/project-head/projects?ticketId=${ticket.id}` : `/project-head/projects/${ticket.project.id}`}>{ticket.project.state === "CREATED" ? "Assign Engineer" : "Open Work"}</NextActionButton>;
  }

  return <div className="ph-record-page">
    <header className="ph-record-header"><div><Link className="back-link" href="/project-head/projects">← Back to Work Pipeline</Link><h1>{ticket.title}</h1><p><code>{ticket.referenceNumber}</code> · {ticket.ward.name} · {ticket.category.name}</p></div><div className="ph-record-header-actions"><WorkStatus state={ticket.internalState} />{primaryAction}</div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <RecordTabs active={tab} onChange={setTab} tabs={[{ id: "OVERVIEW", label: "Overview" }, { id: "ACTIVITY", label: "Activity", count: activity.length }, { id: "DOCUMENTS", label: "Documents", count: documents }]} />

    {tab === "OVERVIEW" ? <div className="ph-record-section" role="tabpanel">
      <CompactAlert title="Next decision" action={primaryAction}>{nextStep}</CompactAlert>
      <section className="ph-record-group"><SectionHeader title="Work progress" description="Project Head decides and coordinates; the assigned Engineer inspects and executes." /><WorkLifecycle current={ticketWorkStage(ticket.internalState)} /></section>

      {canAssignInspection ? <form className="ph-inspection-form" id="inspection-assignment" onSubmit={(event) => void assignInspection(event)}><SectionHeader title="Assign Inspection" description="Choose an Engineer from your agency and set a traceable deadline." /><label>Executive Engineer<select required value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Choose from your agency</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><label>Assignment deadline<input required type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><button className="portal-primary-button" disabled={busy || !engineerId || !deadline} type="submit">{busy ? "Assigning…" : "Assign Inspection"}</button></form> : null}

      {activeInspection ? <section className="ph-record-group"><SectionHeader title="Assigned field inspection" description="Physical inspection remains with the assigned Engineer." /><dl className="ph-detail-grid"><div><dt>Engineer</dt><dd>{activeInspection.assignedEngineer.email}</dd></div><div><dt>Status</dt><dd>{activeInspection.status.replaceAll("_", " ").toLowerCase()}</dd></div><div><dt>Deadline</dt><dd>{new Date(activeInspection.deadline).toLocaleString("en-IN")}</dd></div><div><dt>Accepted</dt><dd>{activeInspection.acceptedAt ? new Date(activeInspection.acceptedAt).toLocaleString("en-IN") : "Awaiting acceptance"}</dd></div></dl></section> : null}

      {submittedInspection ? <section className="ph-record-group ph-inspection-review" id="inspection-review"><SectionHeader title="Review submitted inspection" description="Engineer provides evidence and a recommendation; Project Head authorizes the next civic decision." /><dl className="ph-detail-grid"><div><dt>Issue confirmation</dt><dd>{submittedInspection.issueConfirmation?.replaceAll("_", " ")}</dd></div><div><dt>Severity</dt><dd>{submittedInspection.severity}</dd></div><div><dt>Complexity</dt><dd>{submittedInspection.complexity}</dd></div><div><dt>Recommendation</dt><dd>{submittedInspection.recommendation?.replaceAll("_", " ")}</dd></div><div><dt>Coordination</dt><dd>{submittedInspection.coordinationRequired ? "Required" : "Not required"}</dd></div><div><dt>GPS confirmation</dt><dd>{submittedInspection.latitude}, {submittedInspection.longitude}</dd></div></dl><div className="ph-scope"><h3>Observations</h3><p>{submittedInspection.observations}</p><h3>Recommended work</h3><p>{submittedInspection.recommendedWork}</p></div><div className="ph-document-list">{submittedInspection.evidence.map((item, index) => <a href={item.fileUrl} key={item.id} rel="noreferrer" target="_blank"><span><strong>Site evidence {index + 1}</strong><small>{item.contentType}</small></span><span>Open ↗</span></a>)}</div><label>Project Head review note<textarea required minLength={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><div className="ph-review-actions"><button className="portal-primary-button" disabled={busy} onClick={() => void reviewInspection(submittedInspection.id, "CREATE_WORK")} type="button">Create Civic Work</button><button className="ph-secondary-button" disabled={busy} onClick={() => void reviewInspection(submittedInspection.id, "NO_WORK_REQUIRED")} type="button">Close · No Work Required</button></div><p className="portal-muted">Additional investigation can be assigned from this ticket after review.</p></section> : null}

      <section className="ph-record-group"><SectionHeader title="Issue context" /><dl className="ph-detail-grid"><div><dt>Location</dt><dd>{ticket.address}</dd></div><div><dt>Ward</dt><dd>{ticket.ward.name}</dd></div><div><dt>Origin</dt><dd>{ticket.reporterId ? "Citizen reported and validated" : "Agency originated"}</dd></div><div><dt>Observations</dt><dd>{ticket.observationCount}</dd></div><div><dt>Category</dt><dd>{ticket.category.name}</dd></div><div><dt>Responsible</dt><dd>{ticket.action?.responsibleUser.email ?? "Agency queue"}</dd></div></dl>{ticket.description ? <div className="ph-scope"><h3>Reported issue</h3><p>{ticket.description}</p></div> : null}</section>
      {ticket.routingSuggestions.length ? <section className="ph-record-group"><SectionHeader title="Coordination context" description="Configured suggestions are advisory; no dependency is created automatically." /><ul className="ph-simple-list">{ticket.routingSuggestions.map((agency) => <li key={agency.id}>{agency.name}<span>{agency.type}</span></li>)}</ul></section> : null}
    </div> : null}

    {tab === "ACTIVITY" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Activity" description="Recorded workflow changes, Engineer findings, field updates, and citizen issues." />{activity.length ? <ol className="ph-activity-log">{activity.map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{event.title}</strong><p>{event.detail}</p><time>{new Date(event.at).toLocaleString("en-IN")}</time></div></li>)}</ol> : <p className="portal-muted">No activity has been recorded yet.</p>}</section> : null}

    {tab === "DOCUMENTS" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Documents and evidence" description="Citizen evidence and Engineer-submitted site evidence." />{documents ? <div className="ph-document-list">{ticket.evidence.map((item, index) => <a href={item.url} key={item.id} rel="noreferrer" target="_blank"><span><strong>Reported evidence {index + 1}</strong><small>{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString("en-IN") : "Uploaded evidence"}</small></span><span>Open ↗</span></a>)}{ticket.inspectionReports.flatMap((inspection, index) => [...(inspection.fileUrl ? [<a href={inspection.fileUrl} key={`${inspection.id}:legacy`} rel="noreferrer" target="_blank"><span><strong>Legacy inspection report {index + 1}</strong><small>{inspection.notes ?? inspection.contentType}</small></span><span>Open ↗</span></a>] : []), ...inspection.evidence.map((evidence, evidenceIndex) => <a href={evidence.fileUrl} key={evidence.id} rel="noreferrer" target="_blank"><span><strong>Inspection evidence {evidenceIndex + 1}</strong><small>{inspection.assignedEngineer.email}</small></span><span>Open ↗</span></a>)])}</div> : <p className="portal-muted">No documents are available on this record.</p>}</section> : null}
  </div>;
}
