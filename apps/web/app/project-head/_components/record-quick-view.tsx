"use client";

import type { CitizenTicketTimelineResponse, CivicWork, CoordinationConflict, EngineerCapacitySummary, EngineerProjectDetail, ProjectHeadTicketDetail } from "@civicos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BeforeAfterEvidence, DetailDrawer, DrawerDeepLink, DrawerSection, EngineerAssignmentCard, EvidenceGallery, LocationPreview, StatusSummary, type EvidenceItem } from "../../_components/operational-ui";
import { notifyPortalDataChanged } from "../../_lib/portal-refresh";
import { workStateLabel } from "./work-ui";
import { apiFetch } from "../_lib/api";

export type QuickRecord = { id: string; kind: "ticket" | "project" };

function human(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

function timelineDate(value: Date | string): string {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function reportedEvidence(ticket: ProjectHeadTicketDetail | EngineerProjectDetail["ticket"]): EvidenceItem[] {
  if (!ticket) return [];
  if ("evidence" in ticket) return ticket.evidence.map((item, index) => ({ id: item.id, url: item.url, kind: "Reported", caption: `Citizen evidence ${index + 1}`, timestamp: item.uploadedAt }));
  return ticket.observations.map((item, index) => ({ id: `reported-${index}`, url: item.imageUrl, kind: "Reported", caption: item.note }));
}

function inspectionEvidence(project: EngineerProjectDetail): EvidenceItem[] {
  return project.ticket?.inspectionReports.flatMap((report) => report.evidence.map((item) => ({ id: item.id, url: item.fileUrl, kind: "Inspection" as const, caption: report.observations, timestamp: item.uploadedAt ?? item.createdAt, uploadedBy: report.assignedEngineer.displayName ?? report.assignedEngineer.email, role: "Engineer", contentType: item.contentType }))) ?? [];
}

export function ProjectHeadRecordQuickView({ record, onClose, onChanged }: { record?: QuickRecord; onClose: () => void; onChanged?: () => void }) {
  const [ticket, setTicket] = useState<ProjectHeadTicketDetail>();
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [work, setWork] = useState<CivicWork>();
  const [timeline, setTimeline] = useState<CitizenTicketTimelineResponse>();
  const [engineers, setEngineers] = useState<EngineerCapacitySummary[]>([]);
  const [conflicts, setConflicts] = useState<CoordinationConflict[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [engineerId, setEngineerId] = useState("");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!record) return;
    setTicket(undefined); setProject(undefined); setWork(undefined); setTimeline(undefined); setConflicts([]); setAssignmentOpen(false); setError(undefined);
    try {
      const rosterPromise = apiFetch<{ engineers: EngineerCapacitySummary[] }>("/project-head/engineers");
      if (record.kind === "ticket") {
        const [ticketResult, timelineResult, roster] = await Promise.all([
          apiFetch<{ ticket: ProjectHeadTicketDetail }>(`/tickets/${record.id}`),
          apiFetch<CitizenTicketTimelineResponse>(`/tickets/${record.id}/timeline`),
          rosterPromise,
        ]);
        setTicket(ticketResult.ticket); setTimeline(timelineResult); setEngineers(roster.engineers);
      } else {
        const [projectResult, workResult, conflictResult, roster] = await Promise.all([
          apiFetch<{ project: EngineerProjectDetail }>(`/projects/${record.id}`),
          apiFetch<{ work: CivicWork }>(`/civic-works/${record.id}`),
          apiFetch<{ conflicts: CoordinationConflict[] }>(`/projects/${record.id}/coordination-conflicts`),
          rosterPromise,
        ]);
        setProject(projectResult.project); setWork(workResult.work); setConflicts(conflictResult.conflicts); setEngineers(roster.engineers);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this record");
    }
  }, [record]);
  useEffect(() => { void load(); }, [load]);

  const ticketInspection = ticket?.inspectionReports.find((item) => ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(item.status));
  const canAssignInspection = Boolean(ticket && ["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(ticket.internalState) && !ticketInspection);
  const canAssignWork = Boolean(project && project.state === "CREATED");

  const assign = async () => {
    if (!record || !engineerId) return;
    setBusy(true); setError(undefined);
    try {
      if (record.kind === "ticket") {
        await apiFetch(`/tickets/${record.id}/inspections`, { method: "POST", body: JSON.stringify({ engineerId, deadline: new Date(`${deadline}T17:00:00+05:30`).toISOString() }) });
      } else {
        await apiFetch(`/civic-works/${record.id}`, { method: "PATCH", body: JSON.stringify({ engineerId }) });
      }
      notifyPortalDataChanged(); onChanged?.(); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record this assignment");
    } finally { setBusy(false); }
  };

  const title = ticket?.title ?? project?.title ?? "Opening record";
  const reference = ticket?.referenceNumber ?? project?.referenceNumber ?? "City Connect";
  const state = ticket?.internalState ?? project?.state;
  const primaryLabel = canAssignInspection ? "Assign Inspection" : canAssignWork ? "Assign Engineer" : project && conflicts.some((item) => !item.coordination) ? "Open Coordination" : project && ["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state) ? "Review Completion" : "Open Full Record";
  const deepHref = record ? record.kind === "ticket" ? `/project-head/tickets/${record.id}` : `/project-head/projects/${record.id}` : "/project-head/projects";

  const footer = record ? <>
    {assignmentOpen ? <button className="drawer-primary-action" disabled={busy || !engineerId || (record.kind === "ticket" && !deadline)} onClick={() => void assign()} type="button">{busy ? "Assigning…" : record.kind === "ticket" ? "Confirm Inspection Assignment" : "Confirm Engineer Assignment"}</button> : <button className="drawer-primary-action" onClick={() => {
      if (canAssignInspection || canAssignWork) setAssignmentOpen(true);
      else if (project && conflicts.some((item) => !item.coordination)) window.location.assign(`${deepHref}#coordination`);
      else window.location.assign(deepHref);
    }} type="button">{primaryLabel}</button>}
    <DrawerDeepLink href={deepHref} />
  </> : null;

  const projectBefore = project ? [...reportedEvidence(project.ticket), ...inspectionEvidence(project)] : [];
  const completion = project?.completionEvidence.map((item) => ({ id: item.id, url: item.photoUrl, kind: "Completion" as const, caption: item.notes, timestamp: item.uploadedAt ?? item.createdAt, uploadedBy: project.engineer?.displayName ?? project.engineer?.email, role: "Engineer", contentType: item.contentType })) ?? [];
  const progress = work?.evidence.filter((item) => item.kind === "SITE_PHOTO").map((item) => ({ id: item.id, url: item.url, kind: item.label.toLowerCase().includes("blocker") ? "Blocker" as const : "Progress" as const, caption: item.label, timestamp: item.uploadedAt ?? item.createdAt, contentType: item.contentType })) ?? [];
  const ticketLocation = ticket ? { label: ticket.address, ward: ticket.ward.name } : null;

  return <DetailDrawer footer={footer} onClose={onClose} open={Boolean(record)} reference={reference} status={state ? workStateLabel(state) : undefined} title={title}>
    {error ? <p className="drawer-error" role="alert">{error}</p> : null}
    {!ticket && !project && !error ? <div className="drawer-loading" role="status">Loading decision context…</div> : null}
    {assignmentOpen ? <DrawerSection title={record?.kind === "ticket" ? "Assign inspection" : "Assign work"} description="Workload is calculated from current work, inspections, and overdue actions.">
      {record?.kind === "ticket" && ticket ? <><StatusSummary items={[{ label: "Issue", value: ticket.title }, { label: "Location", value: ticket.address }, { label: "Evidence", value: `${ticket.evidence.length} reported photo${ticket.evidence.length === 1 ? "" : "s"}` }]} /><label className="drawer-deadline">Assignment deadline<input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDeadline(event.target.value)} required type="date" value={deadline} /></label></> : null}
      {record?.kind === "project" && project ? <StatusSummary items={[{ label: "Work", value: project.title }, { label: "Location", value: project.locationLabel ?? "Location pending" }, { label: "Schedule", value: project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Engineer to schedule" }, { label: "Conflict", value: conflicts.length ? `${conflicts.length} advisory warning${conflicts.length === 1 ? "" : "s"}` : "No detected conflict" }]} /> : null}
      <div className="engineer-assignment-list">{engineers.map((engineer) => <EngineerAssignmentCard engineer={engineer} key={engineer.id} onSelect={() => setEngineerId(engineer.id)} selected={engineerId === engineer.id} />)}</div>
    </DrawerSection> : null}
    {!assignmentOpen && ticket ? <>
      <DrawerSection title="Context"><p className="drawer-description">{ticket.description ?? "No additional description was recorded."}</p><StatusSummary items={[{ label: "Origin", value: ticket.reporterId ? "Citizen reported" : "Agency reported" }, { label: "Agency", value: ticket.assignedAgency?.name ?? "Agency queue" }, { label: "Category", value: ticket.category.name }, { label: "Ward", value: ticket.ward.name }, { label: "Reported", value: timelineDate(ticket.createdAt) }, { label: "Responsible", value: ticket.action?.responsibleUser.displayName ?? ticket.action?.responsibleUser.email ?? "Agency queue" }]} /></DrawerSection>
      <DrawerSection title="Location"><LocationPreview label={ticketLocation!.label} ward={ticketLocation!.ward} /></DrawerSection>
      <DrawerSection title="Reported evidence" description={`${ticket.evidence.length} photo${ticket.evidence.length === 1 ? "" : "s"} attached to the original report.`}><EvidenceGallery items={reportedEvidence(ticket)} /></DrawerSection>
      <DrawerSection title="Workflow"><ol className="drawer-timeline">{timeline?.timeline.slice(-5).map((item) => <li key={`${item.status}:${String(item.at)}`}><span aria-hidden="true" /><div><strong>{item.label}</strong><time>{timelineDate(item.at)}</time></div></li>)}</ol>{ticketInspection ? <p className="drawer-note">Assigned to {ticketInspection.assignedEngineer.displayName ?? ticketInspection.assignedEngineer.email} · due {timelineDate(ticketInspection.deadline)}</p> : null}</DrawerSection>
    </> : null}
    {!assignmentOpen && project && work ? <>
      <DrawerSection title="Work context"><StatusSummary items={[{ label: "Origin", value: project.origin === "CITIZEN_REPORTED" ? "Citizen reported" : human(project.origin) }, { label: "Agency", value: project.agency.name }, { label: "Engineer", value: project.engineer?.displayName ?? project.engineer?.email ?? "Unassigned" }, { label: "Location", value: project.locationLabel ?? "Location pending" }, { label: "Schedule", value: project.plannedStart && project.plannedEnd ? `${new Date(project.plannedStart).toLocaleDateString("en-IN")} – ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Not scheduled" }]} /></DrawerSection>
      <DrawerSection title="Location"><LocationPreview features={work.geometry ? [{ geometry: work.geometry, label: work.title }] : []} label={project.locationLabel ?? "Mapped civic work"} ward={project.ticket?.ward.name} /></DrawerSection>
      {completion.length ? <DrawerSection title="Before and after" description="Original or inspection evidence compared with Engineer completion evidence."><BeforeAfterEvidence after={completion} before={projectBefore} /></DrawerSection> : <DrawerSection title="Evidence"><EvidenceGallery items={[...projectBefore, ...progress]} /></DrawerSection>}
      {progress.length ? <DrawerSection title="Work progress"><EvidenceGallery items={progress} /></DrawerSection> : null}
      <DrawerSection title="Workflow"><ol className="drawer-timeline">{project.stateTransitions.slice(-5).map((item) => <li key={item.id}><span aria-hidden="true" /><div><strong>{human(item.toState)}</strong><time>{timelineDate(item.createdAt)}</time></div></li>)}</ol><StatusSummary items={[{ label: "Dependencies", value: project.dependencies.length ? `${project.dependencies.length} linked` : "None" }, { label: "Conflict status", value: conflicts.length ? `${conflicts.length} advisory warning${conflicts.length === 1 ? "" : "s"}` : "No conflict detected" }]} /></DrawerSection>
      {completion.length ? <DrawerSection title="Engineer completion notes"><p className="drawer-description">{completion[0]?.caption}</p></DrawerSection> : null}
    </> : null}
  </DetailDrawer>;
}
