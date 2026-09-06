"use client";

import type { Agency, ProjectListItem, CoordinationConflict, CoordinationRequest } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailDrawer, DrawerDeepLink, DrawerSection, LocationPreview, StatusSummary } from "../../_components/operational-ui";
import { EmptyState, PageHeader, StatusChip } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";
import { CoordinationComposer } from "./coordination-composer";
import { CoordinationDetailClient } from "../coordination/[id]/coordination-detail-client";

export type CoordinationView = "ALL" | "DRAFTS" | "NEEDS_RESPONSE" | "SENT" | "CONFLICTS" | "CLOSED";
type ConflictRow = CoordinationConflict & { projectId: string };
const terminalStatuses = new Set(["COMPLETED", "CLOSED", "REJECTED"]);
const views: Array<{ id: CoordinationView; label: string }> = [
  { id: "ALL", label: "All coordination" }, { id: "DRAFTS", label: "Drafts" },
  { id: "NEEDS_RESPONSE", label: "Needs response" }, { id: "SENT", label: "Sent" },
  { id: "CONFLICTS", label: "Conflicts" }, { id: "CLOSED", label: "Resolved" },
];

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}
function requestLocation(request: CoordinationRequest): string {
  return request.project.locationLabel ?? request.project.ticket?.address ?? request.project.ward?.name ?? "Location not recorded";
}
function dateRange(work: CoordinationConflict["sourceWork"]): string {
  if (!work.plannedStart || !work.plannedEnd) return "Dates incomplete";
  return `${new Date(work.plannedStart).toLocaleDateString("en-IN")} – ${new Date(work.plannedEnd).toLocaleDateString("en-IN")}`;
}
function conflictPairKey(conflict: CoordinationConflict): string {
  return `${[conflict.sourceWork.id, conflict.conflictingWork.id].sort().join(":")}:${conflict.locationDescription.toLowerCase()}`;
}

export function CoordinationRegister({ initialView = "ALL" }: { initialView?: CoordinationView }) {
  const [search, setSearch] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [options, setOptions] = useState<{ agencies: Agency[]; requestTypes: string[] }>({agencies: [], requestTypes: []});
  const [view, setView] = useState<CoordinationView>(initialView);
  const [received, setReceived] = useState<CoordinationRequest[]>([]);
  const [sent, setSent] = useState<CoordinationRequest[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedConflict, setSelectedConflict] = useState<[ConflictRow, ...ConflictRow[]]>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [receivedResult, sentResult, projectResult] = await Promise.all([
        apiFetch<{ requests: CoordinationRequest[] }>("/coordination-requests?direction=received"),
        apiFetch<{ requests: CoordinationRequest[] }>("/coordination-requests?direction=sent"), loadAllAgencyProjects(),
      ]);
      const results = await Promise.all(projectResult.map(async (project) => {
        const result = await apiFetch<{ conflicts: CoordinationConflict[] }>(`/projects/${project.id}/coordination-conflicts`);
        return result.conflicts.map((conflict) => ({ ...conflict, projectId: project.id }));
      }));
      const unique = new Map<string, ConflictRow>();
      results.flat().forEach((conflict) => unique.set(`${conflict.kind}:${conflict.id}`, conflict));
      setReceived(receivedResult.requests); setSent(sentResult.requests); setProjects(projectResult);
      setConflicts([...unique.values()].sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()));
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load coordination records"); }
    finally { setLoading(false); }
  }, []);
  usePortalPolling(load);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view")?.toUpperCase();
    if (requested && views.some(({ id }) => id === requested)) setView(requested as CoordinationView);
  }, []);

  const startRequest = async () => {
    setCreating(true); setSelectedRequestId(undefined);
    try { setOptions(await apiFetch<{ agencies: Agency[]; requestTypes: string[] }>("/coordination-options")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load coordination options"); }
  };
  const activeReceived = received.filter((request) => !terminalStatuses.has(request.status));
  const activeSent = sent.filter((request) => !terminalStatuses.has(request.status) && request.status !== "DRAFT");
  const closed = useMemo(() => [...new Map([...received, ...sent].filter((r) => terminalStatuses.has(r.status)).map((r) => [r.id, r])).values()], [received, sent]);
  const conflictGroups = useMemo(() => {
    const groups = new Map<string, [ConflictRow, ...ConflictRow[]]>();
    for (const conflict of conflicts) { const group = groups.get(conflictPairKey(conflict)); if (group) group.push(conflict); else groups.set(conflictPairKey(conflict), [conflict]); }
    return [...groups.values()];
  }, [conflicts]);
  const allRequests = [...new Map([...received, ...sent].map((request) => [request.id, request])).values()];
  const requests = (view === "NEEDS_RESPONSE" ? activeReceived : view === "SENT" ? activeSent : view === "DRAFTS" ? sent.filter((r) => r.status === "DRAFT") : view === "CLOSED" ? closed : allRequests)
    .filter((r) => [r.subject, r.project.title, requestLocation(r), r.requestingAgency.name, r.respondingAgency.name].some((value) => value.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const selectedRequest = requests.find((r) => r.id === selectedRequestId) ?? requests[0];
  const selectedWork = projects.find((p) => p.id === projectId);
  const filteredConflicts = conflictGroups.filter((group) => [group[0].locationDescription, group[0].sourceWork.title, group[0].conflictingWork.title].some((value) => value.toLowerCase().includes(search.toLowerCase())));
  return <div className="ph-coordination-page">
    <PageHeader title="Coordination" description="Formal inter-agency requests, responses, conflicts, and recorded decisions." action={<button className="portal-primary-button" onClick={() => void startRequest()} type="button">New coordination request</button>} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p className="portal-muted" role="status">Loading coordination records…</p> : null}
    <div className="ph-coordination-workspace">
      <section className="ph-surface ph-coordination-master" aria-label="Coordination records">
        <h2>Coordination items</h2><p>Requests and decisions with partner agencies.</p>
        <div className="ph-coordination-controls"><input aria-label="Search coordination" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Agency, work or location" /><select aria-label="Coordination view" value={view} onChange={(e) => {setView(e.target.value as CoordinationView);setSelectedRequestId(undefined);setCreating(false);}}>{views.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
        {view !== "CONFLICTS" ? <div className="ph-coordination-items">{requests.map((request) => {
          const receiving = received.some((r) => r.id === request.id); const partner = receiving ? request.requestingAgency : request.respondingAgency;
          const action = request.status === "DRAFT" ? "Continue draft" : terminalStatuses.has(request.status) ? "View record" : receiving ? "View & respond" : "View details";
          return <button className="ph-coordination-item" aria-pressed={!creating && selectedRequest?.id === request.id} onClick={() => {setSelectedRequestId(request.id);setCreating(false);}} key={request.id} type="button"><span className="ph-avatar" aria-hidden="true">{partner.name.replace(/[^a-zA-Z]/g, "").slice(0,2).toUpperCase()}</span><span className="ph-coordination-item-copy"><strong>{partner.name}</strong><small>{partner.type}</small><b>{request.subject}</b><small>{request.project.title} · {requestLocation(request)}</small><span className="ph-coordination-item-footer"><StatusChip label={label(request.status)} /><small>Respond by {new Date(request.responseDeadline).toLocaleDateString("en-IN")}</small></span><span className="ph-text-action">{action} →</span></span></button>;
        })}{!loading && !requests.length ? <EmptyState title="No coordination records in this view" description="Choose another view or start a request for your agency's work." /> : null}</div> : <div className="ph-coordination-items">{filteredConflicts.map((group) => {const conflict=group[0]; return <button className="ph-coordination-item" key={conflictPairKey(conflict)} onClick={() => setSelectedConflict(group)} type="button"><span className="ph-avatar" aria-hidden="true">!</span><span className="ph-coordination-item-copy"><strong>{conflict.sourceWork.agency.name} ↔ {conflict.conflictingWork.agency.name}</strong><b>{conflict.locationDescription}</b><small>{conflict.sourceWork.title} · {conflict.conflictingWork.title}</small><small>{conflict.reason}</small><StatusChip label="Advisory conflict" tone="warning" /><span className="ph-text-action">View conflict →</span></span></button>;})}{!loading && !filteredConflicts.length ? <EmptyState title="No advisory conflicts" description="Spatial and schedule warnings appear here with their rule-based reasons." /> : null}</div>}
      </section>
      <aside className="ph-surface ph-coordination-detail" aria-label={creating ? "New coordination request" : "Selected coordination details"}>
        {creating ? <><h2>Send dependency request</h2><p>Request coordination with a partner agency for your work.</p><label className="ph-composer-work">Your work<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Choose civic work</option>{projects.filter((p) => !["CLOSED", "CANCELLED"].includes(p.state)).map((p) => <option key={p.id} value={p.id}>{p.referenceNumber} · {p.title}</option>)}</select></label>{selectedWork ? <><CoordinationComposer key={projectId} projectId={projectId} agencies={options.agencies.filter((a) => a.id !== selectedWork.agencyId)} requestTypes={options.requestTypes} onCancel={() => setCreating(false)} /><section className="ph-recorded-context"><h3>Recorded context</h3><p>{selectedWork.referenceNumber} · {selectedWork.locationLabel ?? selectedWork.ticket?.ward.name ?? "Location pending"}</p><p>{selectedWork.agency.name}</p><Link href={"/project-head/projects/" + projectId}>View related work →</Link></section></> : <EmptyState title="Choose your work" description="Every request is attached to its work and recorded agency context." />}</> : selectedRequest && view !== "CONFLICTS" ? <CoordinationDetailClient embedded key={selectedRequest.id} requestId={selectedRequest.id} /> : <EmptyState title="Select a coordination item" description="Open a request to respond, or inspect a conflict to review its deterministic rules and linked work." />}
      </aside>
    </div>
    <ConflictDrawer group={selectedConflict} onClose={() => setSelectedConflict(undefined)} />
  </div>;
}

function ConflictDrawer({ group, onClose }: { group?: [ConflictRow, ...ConflictRow[]]; onClose: () => void }) {
  const conflict = group?.[0]; if (!conflict) return null;
  const coordination = group.find((item) => item.coordination)?.coordination;
  const targetHref = coordination ? `/project-head/coordination/${coordination.requestId}` : `/project-head/projects/${conflict.projectId}`;
  return <DetailDrawer footer={<><Link className="button primary drawer-primary" href={targetHref}>{coordination ? "Open coordination" : "Initiate coordination"}</Link><DrawerDeepLink href={`/project-head/projects/${conflict.projectId}`}>Open full work record</DrawerDeepLink></>} onClose={onClose} open reference="Advisory conflict" status={coordination ? label(coordination.status) : "Coordination needed"} title={conflict.locationDescription}>
    <DrawerSection title="Spatial overlap"><LocationPreview features={[
      ...(conflict.sourceWork.geometry ? [{ geometry: conflict.sourceWork.geometry, label: conflict.sourceWork.agency.name, tone: "primary" as const }] : []),
      ...(conflict.conflictingWork.geometry ? [{ geometry: conflict.conflictingWork.geometry, label: conflict.conflictingWork.agency.name, tone: "conflict" as const }] : []),
    ]} label={conflict.locationDescription} />{conflict.overlapLengthM != null ? <StatusSummary items={[{ label: "Calculated overlap", value: `${Math.round(conflict.overlapLengthM)} m` }, { label: "Affected road", value: conflict.locationDescription }]} /> : null}</DrawerSection>
    <DrawerSection title="Work A"><StatusSummary items={[{ label: "Agency", value: conflict.sourceWork.agency.name }, { label: "Work", value: conflict.sourceWork.title }, { label: "Schedule", value: dateRange(conflict.sourceWork) }]} /></DrawerSection>
    <DrawerSection title="Work B"><StatusSummary items={[{ label: "Agency", value: conflict.conflictingWork.agency.name }, { label: "Work", value: conflict.conflictingWork.title }, { label: "Schedule", value: dateRange(conflict.conflictingWork) }]} /></DrawerSection>
    <DrawerSection title="Why City Connect flagged this"><div className="conflict-rule-list">{group.map((rule) => <article key={`${rule.kind}:${rule.id}`}><strong>{rule.kind === "ROAD" ? `Road rule · ${label(rule.roadConflictType ?? "spatial")}` : `Schedule and location · ${label(rule.severity)}`}</strong><p>{rule.reason}</p><small>{rule.temporalRelationship}</small></article>)}</div><p className="drawer-advisory">Advisory only — a Project Head decides the sequence and may proceed with a recorded reason.</p></DrawerSection>
  </DetailDrawer>;
}
