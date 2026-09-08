"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { EngineerCapacitySummary, EngineerSummary, ProjectListItem } from "@civicos/shared";
import { CitizenIcon, EmptyState, PageHeader } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";
import { ProjectHeadRecordQuickView, type QuickRecord } from "../_components/record-quick-view";
import { getShortWorkLocation } from "../_lib/work-summary";
import { WorkSummary } from "../_components/work-summary";
import { WorkStatus } from "../_components/work-ui";

export default function TeamsPage() {
  const [engineers, setEngineers] = useState<EngineerCapacitySummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [quickRecord, setQuickRecord] = useState<QuickRecord>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const [reassignments, setReassignments] = useState<Array<{ id: string; reason: string; note: string | null; status: string; project: { id: string; referenceNumber: string; title: string }; requestedBy: EngineerSummary }>>([]);
  const [blockers, setBlockers] = useState<Array<{ id: string; title: string; details: string; severity: string; project: { id: string; referenceNumber: string; title: string }; reportedBy: EngineerSummary }>>([]);
  const [replacementByRequest, setReplacementByRequest] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const [team, work, reassignmentResult, blockerResult] = await Promise.all([
        apiFetch<{ engineers: EngineerCapacitySummary[] }>("/project-head/engineers"),
        loadAllAgencyProjects(),
        apiFetch<{ requests: typeof reassignments }>("/project-reassignment-requests"),
        apiFetch<{ blockers: typeof blockers }>("/project-blockers"),
      ]);
      setEngineers([...team.engineers].sort((a, b) => (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? "", undefined, { numeric: true }))); setProjects(work); setReassignments(reassignmentResult.requests); setBlockers(blockerResult.blockers); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the agency team"); }
    finally { setLoading(false); }
  }, []);
  usePortalPolling(load);
  const workload = useMemo(() => new Map(engineers.map((engineer) => [engineer.id, projects.filter((project) => project.engineerId === engineer.id)])), [engineers, projects]);
  const visibleEngineers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? engineers.filter((engineer) => [engineer.email, engineer.displayName].some((value) => value?.toLowerCase().includes(query))) : engineers;
  }, [engineers, search]);
  const selected = visibleEngineers.find((engineer) => engineer.id === selectedId) ?? visibleEngineers[0];
  const assigned = (selected ? workload.get(selected.id) ?? [] : []).filter((project) => !["CLOSED", "CANCELLED"].includes(project.state));
  const available = engineers.filter((engineer) => engineer.loadLabel === "Available").length;
  const initials = (engineer: EngineerSummary) => (engineer.displayName ?? engineer.email?.split("@")[0] ?? "Engineer").split(/[. _-]+/).map((part) => part[0]).slice(0,2).join("").toUpperCase();
  const reportError = (reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not update this record");
  return <>
    <PageHeader title="Team" description="Manage your team's capacity, assignments and workload." />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p role="status">Loading your agency team…</p> : <section className="ph-team-banner"><span className="ph-avatar" aria-hidden="true"><CitizenIcon name="person" size={38} /></span><div><strong>{available}</strong><h2>Engineers available</h2><p>Of {engineers.length} in your team · Based on current work and inspections</p></div></section>}
    <div className="ph-team-workspace">
      <section className="ph-surface ph-engineer-list"><h2>Engineers ({engineers.length})</h2>{engineers.length > 3 ? <input aria-label="Search engineers" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /> : null}
        {visibleEngineers.map((engineer) => <button type="button" className="ph-engineer-item" aria-pressed={selected?.id === engineer.id} key={engineer.id} onClick={() => {setSelectedId(engineer.id);setAssignOpen(false);}}><span className="ph-avatar" aria-hidden="true">{initials(engineer)}</span><span><strong>{engineer.displayName ?? engineer.email ?? "Engineer"}</strong><small>Engineer</small><small>{engineer.loadReason}</small></span><span className="ph-engineer-availability">{engineer.loadLabel}<span aria-hidden="true"> ›</span></span></button>)}
        {!loading && !visibleEngineers.length ? <EmptyState title={engineers.length ? "No engineers match this search" : "No engineers in this agency"} description="Engineers provisioned for your agency appear here." /> : null}
      </section>
      <section className="ph-surface ph-engineer-detail" aria-label="Selected engineer">{selected ? <><header><span className="ph-avatar">{initials(selected)}</span><div><h2>{selected.displayName ?? selected.email ?? "Engineer"}</h2><p>Engineer</p></div><span className="ph-engineer-availability">{selected.loadLabel}</span></header>
        <div className="ph-engineer-metrics"><div><strong>{assigned.length}</strong><span>Current works</span></div><div><strong>{selected.activeWorks}</strong><span>Active works</span></div><div><strong>{selected.pendingAssignments}</strong><span>Pending assignments</span></div><div><strong className="ph-deadline-value">{selected.nextDeadline ? new Date(selected.nextDeadline).toLocaleDateString("en-IN", {day:"numeric", month:"short",year:"numeric"}) : "None due"}</strong><span>Next deadline</span></div></div>
        <div className="ph-engineer-work-actions"><section><h3>Current assigned works ({assigned.length})</h3>{assigned.map((project) => <button className="ph-engineer-work" key={project.id} onClick={() => setQuickRecord({id: project.id, kind:"project"})} type="button"><WorkSummary reference={project.referenceNumber} title={project.title} location={getShortWorkLocation(project)} /><WorkStatus state={project.state} /></button>)}{!assigned.length ? <EmptyState title="No current assigned work" description="New assignments will appear here." /> : null}</section><aside><h3>Quick actions</h3><button className="portal-primary-button" onClick={() => setAssignOpen((open) => !open)} type="button">Assign work</button><Link className="ph-secondary-button" href="/project-head/work-calendar">View schedule</Link></aside></div>
        {assignOpen ? <section className="ph-team-assignment"><h3>Choose work to assign</h3><p>Select a work to open its existing assignment review.</p>{projects.filter((project) => project.state === "CREATED").map((project) => <button className="ph-engineer-work" type="button" key={project.id} onClick={() => setQuickRecord({id:project.id,kind:"project"})}><WorkSummary reference={project.referenceNumber} title={project.title} location={getShortWorkLocation(project)} /><span aria-hidden="true">&rarr;</span></button>)}{!projects.some((project) => project.state === "CREATED") ? <EmptyState title="No work awaiting assignment" description="Register planned work or review a completed inspection to prepare new work." /> : null}</section> : null}
        {selected.email ? <footer className="ph-engineer-contact"><h3>Contact</h3><a href={"mailto:" + selected.email}>{selected.email}</a></footer> : null}
      </> : <EmptyState title="Select an engineer" description="Their current work and assignment details will appear here." />}</section>
    </div>
    {reassignments.some(({ status }) => status === "PENDING") ? <section className="portal-panel ph-team-decisions"><p className="eyebrow">Needs decision</p><h2>Reassignment requests</h2>{reassignments.filter(({ status }) => status === "PENDING").map((item) => <article key={item.id}><div><strong>{item.project.title}</strong><small>{item.project.referenceNumber} · {item.requestedBy.email} · {item.reason.replaceAll("_", " ")}</small><p>{item.note ?? "No additional note"}</p></div><label>Replacement Engineer<select value={replacementByRequest[item.id] ?? ""} onChange={(event) => setReplacementByRequest((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose Engineer</option>{engineers.filter(({ id }) => id !== item.requestedBy.id).map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><div><button className="ph-secondary-button" type="button" onClick={() => void apiFetch(`/project-reassignment-requests/${item.id}/respond`, { method: "POST", body: JSON.stringify({ decision: "DECLINE", note: "Current assignment retained by Project Head" }) }).then(load).catch(reportError)}>Keep Assignment</button><button className="portal-primary-button" disabled={!replacementByRequest[item.id]} type="button" onClick={() => void apiFetch(`/project-reassignment-requests/${item.id}/respond`, { method: "POST", body: JSON.stringify({ decision: "APPROVE", engineerId: replacementByRequest[item.id], note: "Reassigned after agency capacity review" }) }).then(load).catch(reportError)}>Approve Reassignment</button></div></article>)}</section> : null}
    {blockers.length ? <section className="portal-panel ph-team-decisions"><p className="eyebrow">Field attention</p><h2>Open blockers</h2>{blockers.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.severity} · {item.project.referenceNumber} · {item.reportedBy.email}</small><p>{item.details}</p></div><button className="ph-secondary-button" type="button" onClick={() => { const resolution = window.prompt("How was this blocker resolved?"); if (resolution) void apiFetch(`/project-blockers/${item.id}/resolve`, { method: "POST", body: JSON.stringify({ resolution }) }).then(load).catch(reportError); }}>Resolve Blocker</button></article>)}</section> : null}
    <ProjectHeadRecordQuickView record={quickRecord} onClose={() => setQuickRecord(undefined)} onChanged={() => void load()} />
  </>;
}
