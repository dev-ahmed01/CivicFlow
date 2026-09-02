"use client";

import type { CoordinationConflict, CoordinationRequest } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailDrawer, DrawerDeepLink, DrawerSection, LocationPreview, StatusSummary } from "../../_components/operational-ui";
import { EmptyState, PageHeader, StatusChip } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";

export type CoordinationView = "NEEDS_RESPONSE" | "SENT" | "CONFLICTS" | "CLOSED";
type ConflictRow = CoordinationConflict & { projectId: string };
const terminalStatuses = new Set(["COMPLETED", "CLOSED", "REJECTED"]);
const views: Array<{ id: CoordinationView; label: string }> = [
  { id: "NEEDS_RESPONSE", label: "Needs Action" }, { id: "SENT", label: "Sent Requests" },
  { id: "CONFLICTS", label: "Detected Conflicts" }, { id: "CLOSED", label: "Resolved" },
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

export function CoordinationRegister({ initialView = "NEEDS_RESPONSE" }: { initialView?: CoordinationView }) {
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
      setReceived(receivedResult.requests); setSent(sentResult.requests);
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

  const activeReceived = received.filter((request) => !terminalStatuses.has(request.status));
  const activeSent = sent.filter((request) => !terminalStatuses.has(request.status));
  const closed = useMemo(() => [...new Map([...received, ...sent].filter((r) => terminalStatuses.has(r.status)).map((r) => [r.id, r])).values()], [received, sent]);
  const conflictGroups = useMemo(() => {
    const groups = new Map<string, [ConflictRow, ...ConflictRow[]]>();
    for (const conflict of conflicts) { const group = groups.get(conflictPairKey(conflict)); if (group) group.push(conflict); else groups.set(conflictPairKey(conflict), [conflict]); }
    return [...groups.values()];
  }, [conflicts]);
  const counts = new Map<CoordinationView, number>([["NEEDS_RESPONSE", activeReceived.length], ["SENT", activeSent.length], ["CONFLICTS", conflictGroups.length], ["CLOSED", closed.length]]);
  const requests = view === "NEEDS_RESPONSE" ? activeReceived : view === "SENT" ? activeSent : closed;

  return <div className="ph-coordination-page">
    <PageHeader title="Coordination & Conflicts" description="System detection → human coordination → agreed sequence. Recommendations remain advisory until a Project Head decides." />
    <div aria-label="Coordination views" className="portal-tabs ph-coordination-tabs" role="tablist">{views.map((item) => <button aria-selected={view === item.id} key={item.id} onClick={() => setView(item.id)} role="tab" type="button">{item.label} <span>{counts.get(item.id) ?? 0}</span></button>)}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}{loading ? <p className="portal-muted" role="status">Loading the coordination register…</p> : null}
    {!loading && view !== "CONFLICTS" ? <section className="ph-coordination-register"><div className="table-scroll"><table><thead><tr><th>Partner agency</th><th>Request</th><th>Related work</th><th>Status</th><th>Response deadline</th><th>Responsible</th><th>Action</th></tr></thead><tbody>{requests.map((request) => {
      const receivedByUs = received.some((item) => item.id === request.id); const partner = receivedByUs ? request.requestingAgency : request.respondingAgency;
      const overdue = new Date(request.responseDeadline).getTime() < Date.now() && !terminalStatuses.has(request.status);
      return <tr key={request.id}><td><strong>{partner.name}</strong><small>{partner.type}</small></td><td><strong>{request.subject}</strong><small>{label(request.requestTypeKey)}</small></td><td><Link href={`/project-head/projects/${request.project.id}`}><strong>{request.project.title}</strong><small>{requestLocation(request)} · {request.project.referenceNumber}</small></Link></td><td><StatusChip label={label(request.status)} /></td><td className={overdue ? "deadline-overdue" : ""}>{new Date(request.responseDeadline).toLocaleString("en-IN")}</td><td>{request.assignedEngineer?.displayName ?? request.assignedEngineer?.email ?? "Not assigned"}</td><td><Link className="ph-row-action" href={`/project-head/coordination/${request.id}`}>{view === "NEEDS_RESPONSE" ? "Respond" : "Open"} →</Link></td></tr>;
    })}</tbody></table></div>{requests.length === 0 ? <EmptyState title={`No ${view === "NEEDS_RESPONSE" ? "requests need a response" : view === "SENT" ? "sent requests are open" : "closed coordination records"}`} description="Start a request from the related work record when another agency’s input is required." /> : null}</section> : null}
    {!loading && view === "CONFLICTS" ? <section className="ph-conflict-register">{conflictGroups.length ? <ol>{conflictGroups.map((group) => { const conflict = group[0]; const coordination = group.find((item) => item.coordination)?.coordination; return <li key={conflictPairKey(conflict)}><button className="ph-conflict-open" onClick={() => setSelectedConflict(group)} type="button"><span className="ph-conflict-place"><small>Conflict detected</small><strong>{conflict.locationDescription}</strong><span>{conflict.sourceWork.agency.name} ↔ {conflict.conflictingWork.agency.name}</span></span><span className="ph-conflict-works"><small>{conflict.sourceWork.agency.name}</small><strong>{conflict.sourceWork.title}</strong><span>{dateRange(conflict.sourceWork)}</span><b aria-hidden="true">↕ overlapping place and time</b><small>{conflict.conflictingWork.agency.name}</small><strong>{conflict.conflictingWork.title}</strong><span>{dateRange(conflict.conflictingWork)}</span></span><span className="ph-conflict-reason"><strong>{label(conflict.temporalRelationship)}</strong><span>{conflict.reason}</span><small>{group.length} deterministic rule{group.length === 1 ? "" : "s"} matched</small></span><span className="ph-conflict-action"><StatusChip label={coordination ? label(coordination.status) : "Coordination needed"} tone={coordination ? undefined : "warning"} /><b>Inspect conflict →</b></span></button></li>; })}</ol> : <EmptyState title="No advisory conflicts" description="Deterministic spatial and schedule checks will appear here with their rule-based reason." />}</section> : null}
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
    <DrawerSection title="Why City Connect flagged this"><div className="conflict-rule-list">{group.map((rule) => <article key={`${rule.kind}:${rule.id}`}><strong>{rule.kind === "ROAD" ? `Road rule · ${label(rule.roadConflictType ?? "spatial")}` : `Schedule and location · ${label(rule.severity)}`}</strong><p>{rule.reason}</p><small>Recommendation: {rule.suggestedAction}</small></article>)}</div><p className="drawer-advisory">Advisory only — a Project Head decides the sequence and may proceed with a recorded reason.</p></DrawerSection>
  </DetailDrawer>;
}
