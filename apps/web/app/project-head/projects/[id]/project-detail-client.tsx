"use client";

import type { Agency, CoordinationConflict, CoordinationRequest, DependencyListItem, EngineerProjectDetail, SequencingRecommendationOutcome } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { NextActionButton } from "../../../_components/operations";
import { RoadIntelligencePanel, type RoadIntelligenceData } from "../../../_components/road-intelligence-panel";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { CompactAlert, projectWorkStage, RecordTabs, SectionHeader, WorkLifecycle, WorkStatus } from "../../_components/work-ui";
import { CoordinationComposer, type CoordinationPrefill } from "../../_components/coordination-composer";
import { apiFetch } from "../../_lib/api";

const emptyRoadData: RoadIntelligenceData = { conflicts: [], recommendations: [], segment: null, interventionHistory: [] };
type RecordTab = "OVERVIEW" | "ACTIVITY" | "COORDINATION" | "DOCUMENTS";

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

function dateRange(work: CoordinationConflict["sourceWork"]): string {
  if (!work.plannedStart || !work.plannedEnd) return "Dates incomplete";
  return `${new Date(work.plannedStart).toLocaleDateString("en-IN")} – ${new Date(work.plannedEnd).toLocaleDateString("en-IN")}`;
}

function prefillFor(conflict: CoordinationConflict): CoordinationPrefill {
  return {
    respondingAgencyId: conflict.conflictingWork.agency.id,
    requestTypeKey: conflict.kind === "ROAD" ? "road-cut-excavation-coordination" : "schedule-coordination",
    subject: `Coordinate ${conflict.sourceWork.title} with ${conflict.conflictingWork.title}`,
    details: [
      `Conflicting work: ${conflict.conflictingWork.referenceNumber} · ${conflict.conflictingWork.title}`,
      `Location: ${conflict.locationDescription}`,
      `Our proposed dates: ${dateRange(conflict.sourceWork)}`,
      `Their proposed dates: ${dateRange(conflict.conflictingWork)}`,
      `Flag reason: ${conflict.reason}`,
    ].join("\n"),
    initialMessage: `Please review the overlap at ${conflict.locationDescription} and agree an advisory execution sequence and any required date changes.`,
    conflictSource: { kind: conflict.kind, conflictId: conflict.id, conflictingProjectId: conflict.conflictingWork.id },
  };
}

function conflictPairKey(conflict: CoordinationConflict): string {
  const pair = [conflict.sourceWork.id, conflict.conflictingWork.id].sort().join(":");
  return `${pair}:${conflict.locationDescription.toLowerCase()}`;
}

function deadlineText(value: Date | string): string {
  const date = new Date(value);
  const overdue = date.getTime() < Date.now();
  return `${overdue ? "Overdue" : "Due"} ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [conflicts, setConflicts] = useState<CoordinationConflict[]>([]);
  const [roadData, setRoadData] = useState<RoadIntelligenceData>(emptyRoadData);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [requests, setRequests] = useState<CoordinationRequest[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [requestTypes, setRequestTypes] = useState<string[]>([]);
  const [tab, setTab] = useState<RecordTab>("OVERVIEW");
  const [coordinationOpen, setCoordinationOpen] = useState(false);
  const [coordinationPrefill, setCoordinationPrefill] = useState<CoordinationPrefill>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [projectResult, conflictResult, roadResult, dependencyResult, sentResult, receivedResult, options] = await Promise.all([
        apiFetch<{ project: EngineerProjectDetail }>(`/projects/${projectId}`),
        apiFetch<{ conflicts: CoordinationConflict[] }>(`/projects/${projectId}/coordination-conflicts`),
        apiFetch<RoadIntelligenceData>(`/projects/${projectId}/road-intelligence`),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=sent"),
        apiFetch<{ requests: CoordinationRequest[] }>("/coordination-requests?direction=sent"),
        apiFetch<{ requests: CoordinationRequest[] }>("/coordination-requests?direction=received"),
        apiFetch<{ agencies: Agency[]; requestTypes: string[] }>("/coordination-options"),
      ]);
      const relatedRequests = [...sentResult.requests, ...receivedResult.requests].filter((request) => request.projectId === projectId || request.conflictingProjectId === projectId);
      setProject(projectResult.project);
      setConflicts(conflictResult.conflicts);
      setRoadData(roadResult);
      setDependencies(dependencyResult.dependencies.filter((dependency) => dependency.projectId === projectId));
      setRequests([...new Map(relatedRequests.map((request) => [request.id, request])).values()]);
      setAgencies(options.agencies);
      setRequestTypes(options.requestTypes);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this work record");
    }
  }, [projectId]);
  usePortalPolling(load);

  const actOnRecommendation = async (recommendationId: string, outcome: SequencingRecommendationOutcome, revision?: { plannedStart: string; plannedEnd: string }) => {
    await apiFetch(`/sequencing-recommendations/${recommendationId}/actions`, { method: "POST", body: JSON.stringify({ outcome, ...(revision ? { timelineRevision: { projectId, ...revision } } : {}) }) });
    notifyPortalDataChanged();
    await load();
  };

  const activity = useMemo(() => {
    if (!project) return [];
    return [
      { id: `created-${project.id}`, title: "Work record created", detail: project.origin === "CITIZEN_REPORTED" ? "Created from a validated citizen issue" : label(project.origin), at: project.createdAt },
      ...project.stateTransitions.map((transition) => ({ id: transition.id, title: label(transition.toState), detail: transition.reason, at: transition.createdAt })),
      ...project.workNotes.map((note) => ({ id: note.id, title: "Field update", detail: note.note, at: note.createdAt })),
      ...project.completionEvidence.map((evidence) => ({ id: evidence.id, title: "Completion evidence submitted", detail: evidence.notes, at: evidence.uploadedAt ?? evidence.createdAt })),
      ...requests.flatMap((request) => request.entries.map((entry) => ({ id: entry.id, title: `${request.respondingAgency.name} · ${label(entry.action)}`, detail: entry.message ?? `${label(entry.fromStatus ?? "DRAFT")} to ${label(entry.toStatus ?? request.status)}`, at: entry.createdAt }))),
    ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
  }, [project, requests]);
  const conflictGroups = useMemo(() => {
    const groups = new Map<string, [CoordinationConflict, ...CoordinationConflict[]]>();
    for (const conflict of conflicts) {
      const key = conflictPairKey(conflict);
      const group = groups.get(key);
      if (group) group.push(conflict);
      else groups.set(key, [conflict]);
    }
    return [...groups.values()];
  }, [conflicts]);

  if (!project && !error) return <p className="portal-muted">Loading work record…</p>;
  if (!project) return <p className="error" role="alert">{error}</p>;

  const availableAgencies = agencies.filter((agency) => agency.id !== project.agencyId);
  const openCoordination = (prefill?: CoordinationPrefill) => {
    setCoordinationPrefill(prefill);
    setCoordinationOpen(true);
    setTab("COORDINATION");
  };
  const openConflict = conflictGroups.flat().find((conflict) => !conflict.coordination);
  const incomingRequest = requests.find((request) => request.respondingAgency.id === project.agencyId && !["COMPLETED", "CLOSED", "REJECTED"].includes(request.status));
  const documentCount = (project.ticket?.observations.length ?? 0) + (project.ticket?.inspectionReports.length ?? 0) + project.completionEvidence.length + requests.reduce((total, request) => total + request.entries.reduce((entryTotal, entry) => entryTotal + entry.attachments.length, 0), 0);

  let nextStep = "Continue monitoring delivery from this work record.";
  let primaryAction: ReactNode = <NextActionButton href="/project-head/work-calendar">Open schedule</NextActionButton>;
  if (project.grievance) {
    nextStep = "A citizen issue is open on this work and requires review.";
    primaryAction = <NextActionButton href={`/project-head/grievances?grievance=${project.grievance.id}`}>Review issue</NextActionButton>;
  } else if (incomingRequest) {
    nextStep = `${incomingRequest.requestingAgency.name} is waiting for a response to “${incomingRequest.subject}”.`;
    primaryAction = <NextActionButton href={`/project-head/coordination/${incomingRequest.id}`}>Respond</NextActionButton>;
  } else if (openConflict) {
    nextStep = `${openConflict.conflictingWork.agency.name} has overlapping work at ${openConflict.locationDescription}. The warning is advisory and needs coordination.`;
    primaryAction = <NextActionButton onClick={() => setTab("COORDINATION")}>Review coordination</NextActionButton>;
  } else if (project.state === "CREATED" && project.ticketId) {
    nextStep = "The work is ready for an Executive Engineer assignment.";
    primaryAction = <NextActionButton href={`/project-head/projects?ticketId=${project.ticketId}`}>Assign engineer</NextActionButton>;
  } else if (project.state === "PENDING_UPTAKE") {
    nextStep = `${project.engineer?.email ?? "The assigned engineer"} must accept the work before planning continues.`;
    primaryAction = null;
  } else if (["UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED"].includes(project.state)) {
    nextStep = project.plannedStart && project.plannedEnd ? "Planning is recorded. Review the schedule and any connected agency work." : "The assigned engineer must confirm the delivery timeline.";
    primaryAction = <NextActionButton href="/project-head/work-calendar">Open schedule</NextActionButton>;
  } else if (["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state)) {
    nextStep = project.state === "COMPLETED" ? "Completion evidence has been submitted for verification." : "Citizen verification is pending before this work can close.";
    primaryAction = <NextActionButton onClick={() => setTab("DOCUMENTS")}>Review completion</NextActionButton>;
  } else if (project.state === "CLOSED") {
    nextStep = "This work is closed. Activity and technical traceability remain available.";
    primaryAction = null;
  }

  return <div className="ph-record-page">
    <header className="ph-record-header"><div><Link className="back-link" href="/project-head/projects">← Back to Work</Link><h1>{project.ticket?.title ?? project.title}</h1><p><code>{project.referenceNumber}</code> · {project.ticket?.ward.name ?? project.locationLabel ?? "Location pending"} · {project.agency.name}</p><span className="ph-record-assignee">Responsible: {project.engineer?.email ?? "Unassigned"}</span></div><div className="ph-record-header-actions"><WorkStatus state={project.state} />{conflictGroups.length ? <button className="ph-warning-link" onClick={() => setTab("COORDINATION")} type="button">{conflictGroups.length} coordination issue{conflictGroups.length === 1 ? "" : "s"}</button> : null}{primaryAction}</div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <RecordTabs active={tab} onChange={setTab} tabs={[{ id: "OVERVIEW", label: "Overview" }, { id: "ACTIVITY", label: "Activity", count: activity.length }, { id: "COORDINATION", label: "Coordination", count: conflictGroups.length + dependencies.length + requests.length }, { id: "DOCUMENTS", label: "Documents", count: documentCount }]} />

    {tab === "OVERVIEW" ? <div className="ph-record-section" role="tabpanel">
      <CompactAlert title="Next step" action={primaryAction}>{nextStep}</CompactAlert>
      <section className="ph-record-group"><SectionHeader title="Work progress" description="The operational lifecycle from report to closure." /><WorkLifecycle current={projectWorkStage(project.state)} /></section>
      {project.grievance ? <CompactAlert title="Citizen issue" tone="danger" action={<NextActionButton href={`/project-head/grievances?grievance=${project.grievance.id}`}>Review issue</NextActionButton>}>{label(project.grievance.reason)} · opened {new Date(project.grievance.createdAt).toLocaleDateString("en-IN")}</CompactAlert> : null}
      <section className="ph-record-group"><SectionHeader title="Work details" /><dl className="ph-detail-grid"><div><dt>Location</dt><dd>{project.locationLabel ?? project.ticket?.address ?? "Not recorded"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "Not recorded"}</dd></div><div><dt>Agency</dt><dd>{project.agency.name}</dd></div><div><dt>Source</dt><dd>{project.origin === "CITIZEN_REPORTED" ? "Citizen reported" : label(project.origin)}</dd></div><div><dt>Linked ticket</dt><dd>{project.ticket ? <Link href={`/project-head/tickets/${project.ticket.id}`}>{project.ticket.title}</Link> : "Standalone agency work"}</dd></div><div><dt>Priority</dt><dd>{label(project.priority)}</dd></div></dl>{project.workDescription || project.ticket?.address ? <div className="ph-scope"><h3>Scope</h3><p>{project.workDescription ?? project.ticket?.address}</p></div> : null}</section>
      <section className="ph-record-group"><SectionHeader title="Schedule and responsibility" /><dl className="ph-detail-grid"><div><dt>Planned start</dt><dd>{project.plannedStart ? new Date(project.plannedStart).toLocaleDateString("en-IN") : "Not set"}</dd></div><div><dt>Planned end</dt><dd>{project.plannedEnd ? new Date(project.plannedEnd).toLocaleDateString("en-IN") : "Not set"}</dd></div><div><dt>Engineer</dt><dd>{project.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Response deadline</dt><dd className={project.action && new Date(project.action.deadline).getTime() < Date.now() ? "deadline-overdue" : ""}>{project.action ? deadlineText(project.action.deadline) : "No pending response"}</dd></div><div><dt>Actual start</dt><dd>{project.actualStart ? new Date(project.actualStart).toLocaleDateString("en-IN") : "Not recorded"}</dd></div><div><dt>Completion</dt><dd>{project.actualCompletion ? new Date(project.actualCompletion).toLocaleDateString("en-IN") : "Not recorded"}</dd></div></dl></section>
    </div> : null}

    {tab === "ACTIVITY" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Activity" description="An auditable history of workflow, field, completion, and coordination events." />{activity.length ? <ol className="ph-activity-log">{activity.map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{event.title}</strong><p>{event.detail}</p><time>{new Date(event.at).toLocaleString("en-IN")}</time></div></li>)}</ol> : <p className="portal-muted">No activity has been recorded yet.</p>}</section> : null}

    {tab === "COORDINATION" ? <div className="ph-record-section" role="tabpanel">
      <section className="ph-record-group"><SectionHeader title="Coordination" description="Formal requests, agency dependencies, advisory conflicts, and road sequencing attached to this work." action={<NextActionButton onClick={() => coordinationOpen ? setCoordinationOpen(false) : openCoordination()} secondary>{coordinationOpen ? "Close request form" : "New coordination request"}</NextActionButton>} />{coordinationOpen ? <CoordinationComposer key={coordinationPrefill ? `${coordinationPrefill.conflictSource.kind}:${coordinationPrefill.conflictSource.conflictId}` : "general"} agencies={availableAgencies} onCancel={() => setCoordinationOpen(false)} prefill={coordinationPrefill} projectId={projectId} requestTypes={requestTypes} /> : null}</section>

      {conflictGroups.length ? <section className="ph-record-group"><SectionHeader title="Conflicts" description="Advisory overlaps requiring a documented coordination decision." /><div className="ph-conflict-list">{conflictGroups.map((group) => { const conflict = group.find((item) => !item.coordination) ?? group[0]; const coordination = group.find((item) => item.coordination)?.coordination; return <article key={conflictPairKey(conflict)}><div><strong>{conflict.locationDescription}</strong><span>{conflict.sourceWork.agency.name} ↔ {conflict.conflictingWork.agency.name}</span><small>{dateRange(conflict.sourceWork)} · {dateRange(conflict.conflictingWork)}</small></div><p>{conflict.temporalRelationship}</p><div>{coordination ? <NextActionButton href={`/project-head/coordination/${coordination.requestId}`} secondary>Open coordination</NextActionButton> : <NextActionButton onClick={() => openCoordination(prefillFor(conflict))}>Coordinate</NextActionButton>}<details><summary>Rule details ({group.length})</summary><ul>{group.map((rule) => <li key={`${rule.kind}:${rule.id}`}><strong>{rule.kind === "ROAD" ? `Road rule: ${label(rule.roadConflictType ?? "spatial overlap")}` : `Conflict severity: ${label(rule.severity)}`}</strong><span>{rule.reason}</span></li>)}</ul></details></div></article>; })}</div></section> : null}

      {requests.length ? <section className="ph-record-group"><SectionHeader title="Request register" /><div className="table-scroll"><table className="ph-record-table"><thead><tr><th>Partner agency</th><th>Subject</th><th>Status</th><th>Response deadline</th><th>Action</th></tr></thead><tbody>{requests.map((request) => { const partner = request.requestingAgency.id === project.agencyId ? request.respondingAgency : request.requestingAgency; return <tr key={request.id}><td>{partner.name}</td><td><strong>{request.subject}</strong><small>{label(request.requestTypeKey)}</small></td><td>{label(request.status)}</td><td className={new Date(request.responseDeadline).getTime() < Date.now() && !["CLOSED", "COMPLETED"].includes(request.status) ? "deadline-overdue" : ""}>{deadlineText(request.responseDeadline)}</td><td><Link className="ph-row-action" href={`/project-head/coordination/${request.id}`}>{request.respondingAgency.id === project.agencyId ? "Respond" : "Open"} →</Link></td></tr>; })}</tbody></table></div></section> : null}

      {dependencies.length ? <section className="ph-record-group"><SectionHeader title="Agency dependencies" /><ul className="ph-dependency-list">{dependencies.map((dependency) => <li key={dependency.id}><div><strong>{dependency.respondingAgency.name}</strong><span>{dependency.requirement}</span></div><span>{label(dependency.state)}</span><small>{deadlineText(dependency.deadline)}</small></li>)}</ul></section> : null}

      <section className="ph-record-group"><SectionHeader title="Road coordination" description="Deterministic overlap and sequencing checks for this road segment. Warnings remain advisory." /><RoadIntelligencePanel data={roadData} projectId={projectId} plannedStart={project.plannedStart} plannedEnd={project.plannedEnd} onAction={actOnRecommendation} /></section>
    </div> : null}

    {tab === "DOCUMENTS" ? <section className="ph-record-group" role="tabpanel"><SectionHeader title="Documents and evidence" description="Inspection reports, site evidence, completion evidence, and coordination attachments." />{documentCount ? <div className="ph-document-list">{project.ticket?.observations.map((item, index) => <a href={item.imageUrl} key={`observation-${index}`} rel="noreferrer" target="_blank"><span><strong>Reported evidence {index + 1}</strong><small>{item.note ?? "Citizen or agency evidence"}</small></span><span>Open ↗</span></a>)}{project.ticket?.inspectionReports.map((item, index) => <a href={item.fileUrl} key={item.id} rel="noreferrer" target="_blank"><span><strong>Inspection report {index + 1}</strong><small>{item.notes ?? item.contentType}</small></span><span>Open ↗</span></a>)}{project.completionEvidence.map((item, index) => <a href={item.photoUrl} key={item.id} rel="noreferrer" target="_blank"><span><strong>Completion evidence {index + 1}</strong><small>{item.notes}</small></span><span>Open ↗</span></a>)}{requests.flatMap((request) => request.entries.flatMap((entry) => entry.attachments.map((attachment) => <a href={attachment.url} key={attachment.id} rel="noreferrer" target="_blank"><span><strong>{attachment.fileName}</strong><small>{request.subject} · {attachment.contentType}</small></span><span>Open ↗</span></a>)))}</div> : <p className="portal-muted">No documents are available on this record.</p>}</section> : null}
  </div>;
}
