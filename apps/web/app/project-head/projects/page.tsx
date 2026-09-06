"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CivicWorkOrigin, PaginationMeta, ProjectHeadTicketSummary, ProjectListItem, ProjectState, TicketState } from "@civicos/shared";
import { EmptyState, PageHeader, PaginationControls } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { getShortWorkLocation } from "../_lib/work-summary";
import { WorkSummary } from "../_components/work-summary";
import { WorkStatus } from "../_components/work-ui";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";
import { ProjectCreateClient } from "./new/project-create-client";
import { lifecycleGroup, pipelineStage, type WorkLifecycle, type WorkView } from "./pipeline";
import { ProjectHeadRecordQuickView, type QuickRecord } from "../_components/record-quick-view";


type WorkRow = {
  id: string;
  kind: "ticket" | "project";
  title: string;
  reference: string;
  origin: CivicWorkOrigin;
  location: string;
  category?: string;
  state: TicketState | ProjectState;
  owner: string;
  agency?: string;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  deadline?: Date | string | null;
  updatedAt: Date | string;
  grievanceId?: string;
  ticketId?: string;
  projectId?: string;
  dependencyCount: number;
  conflictCount: number;
  coordinationCount: number;
};

const views: Array<{ id: WorkLifecycle; label: string }> = [
  { id: "ALL", label: "All" }, { id: "UPCOMING", label: "Upcoming" },
  { id: "ONGOING", label: "Ongoing" }, { id: "REVIEW", label: "Review" }, { id: "COMPLETED", label: "Completed" },
];

async function loadAllTickets(): Promise<ProjectHeadTicketSummary[]> {
  const first = await apiFetch<{ tickets: ProjectHeadTicketSummary[]; pagination: PaginationMeta }>("/tickets?page=1&limit=50");
  if (first.pagination.totalPages <= 1) return first.tickets;
  const remaining = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => apiFetch<{ tickets: ProjectHeadTicketSummary[] }>(`/tickets?page=${index + 2}&limit=50`)));
  return [first.tickets, ...remaining.map((result) => result.tickets)].flat();
}

function deadline(row: WorkRow): { label: string; overdue: boolean } {
  if (!row.deadline) return { label: "Not set", overdue: false };
  const value = new Date(row.deadline);
  const overdue = value.getTime() < Date.now() && pipelineStage(row.kind, row.state) !== "CLOSED";
  return { label: `${overdue ? "Overdue · " : ""}${value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, overdue };
}

function originLabel(origin: CivicWorkOrigin): string {
  if (origin === "AGENCY_PLANNED") return "Agency planned";
  if (origin === "SYSTEM_INTEGRATION") return "System integration";
  return "Citizen issue";
}

export default function WorkPipelinePage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [view, setView] = useState<WorkLifecycle>("ALL");
  const [legacyView, setLegacyView] = useState<WorkView>();
  const [dueFilter, setDueFilter] = useState<string>();
  const [sort, setSort] = useState("updated");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [quickRecord, setQuickRecord] = useState<QuickRecord>();

  const load = useCallback(async () => {
    try {
      const [ticketResult, projectResult] = await Promise.all([loadAllTickets(), loadAllAgencyProjects()]);
      setTickets(ticketResult);
      setProjects(projectResult);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the work pipeline");
    } finally { setLoading(false); }
  }, []);
  usePortalPolling(load);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedView = query.get("view")?.toUpperCase();
    const requestedTicket = query.get("ticketId");
    const requestedProject = query.get("project");
    if (requestedProject) { router.replace(`/project-head/projects/${requestedProject}`); return; }
    if (requestedView && views.some(({ id }) => id === requestedView)) setView(requestedView as WorkLifecycle);
    else if (requestedView && ["INTAKE", "INSPECTION", "READY", "SCHEDULED", "ACTIVE", "CLOSURE", "CLOSED"].includes(requestedView)) {
      setLegacyView(requestedView as WorkView);
      setView(requestedView === "ACTIVE" ? "ONGOING" : requestedView === "CLOSURE" ? "REVIEW" : requestedView === "CLOSED" ? "COMPLETED" : "UPCOMING");
    }
    setDueFilter(query.get("due") ?? undefined);
    if (requestedTicket) { setTicketId(requestedTicket); setCreateOpen(true); }
  }, [router]);

  const rows = useMemo<WorkRow[]>(() => {
    const intakeStates: TicketState[] = ["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE"];
    const ticketRows = tickets.filter((ticket) => intakeStates.includes(ticket.state)).map((ticket): WorkRow => ({
      id: ticket.id,
      kind: "ticket",
      title: ticket.title,
      reference: ticket.referenceNumber,
      origin: "CITIZEN_REPORTED",
      location: getShortWorkLocation(ticket),
      category: ticket.category.name,
      state: ticket.inspectionDue ? "INSPECTION_DUE" : ticket.state,
      agency: ticket.assignedAgency?.name,
      owner: ticket.action?.responsibleUser.email ?? ticket.assignedAgency?.name ?? "Agency queue",
      deadline: ticket.action?.deadline,
      updatedAt: ticket.validatedAt ?? ticket.createdAt,
      grievanceId: ticket.grievance?.id,
      ticketId: ticket.id,
      dependencyCount: 0,
      conflictCount: 0,
      coordinationCount: 0,
    }));
    const projectRows = projects.map((project): WorkRow => ({
      id: project.id,
      kind: "project",
      title: project.title,
      reference: project.referenceNumber,
      origin: project.origin,
      location: getShortWorkLocation(project),
      state: project.state,
      owner: project.engineer?.displayName ?? project.engineer?.email ?? "Unassigned",
      agency: project.agency.name,
      plannedStart: project.plannedStart,
      plannedEnd: project.plannedEnd,
      deadline: project.action?.deadline ?? project.plannedEnd,
      updatedAt: project.updatedAt,
      grievanceId: project.grievance?.id,
      ticketId: project.ticketId ?? undefined,
      projectId: project.id,
      dependencyCount: project.dependencyCount,
      conflictCount: project.conflictCount + project.roadConflictCount,
      coordinationCount: project.coordinationCount,
    }));
    return [...ticketRows, ...projectRows].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [projects, tickets]);

  const counts = useMemo(() => new Map(views.map(({ id }) => [id, id === "ALL" ? rows.length : rows.filter((row) => lifecycleGroup(row.kind, row.state) === id).length])), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (view !== "ALL" && lifecycleGroup(row.kind, row.state) !== view) return false;
    if (legacyView && pipelineStage(row.kind, row.state) !== legacyView) return false;
    // Same planned-date eligibility as the agency dashboard; excludes closure and cancelled work.
    if (dueFilter) {
      if (row.kind !== "project" || ["COMPLETED", "AWAITING_VERIFICATION", "CLOSED", "CANCELLED"].includes(row.state)) return false;
      if (dueFilter === "overdue") return Boolean(row.plannedEnd && new Date(row.plannedEnd).getTime() < Date.now());
      if (dueFilter === "upcoming") return row.state !== "ACTIVE" && Boolean(row.plannedStart && new Date(row.plannedStart).getTime() >= Date.now() && new Date(row.plannedStart).getTime() <= Date.now() + 7 * 86400000);
    }
    return true;
  }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "deadline" ? (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [rows, view, legacyView, dueFilter, sort]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const visible = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
  const eligibleTickets = tickets.filter((ticket) => ["INSPECTION_COMPLETE", "PROJECT_CREATED"].includes(ticket.state));

  const changeView = (next: WorkLifecycle) => { setView(next); setLegacyView(undefined); setDueFilter(undefined); setPage(1); };

  return <div className="ph-work-page">
    <PageHeader title="Work" description="All agency works from planning to verified closure." action={<Link className="portal-primary-button" href="/project-head/projects/new">Register planned work</Link>} />
    <div aria-label="Work lifecycle stages" className="portal-tabs ph-work-tabs" role="tablist">{views.map((item) => <button aria-selected={view === item.id} key={item.id} onClick={() => changeView(item.id)} role="tab" type="button">{item.label}<span>{counts.get(item.id) ?? 0}</span></button>)}</div>

    {createOpen ? <section className="portal-inline-drawer project-ready-drawer" aria-label="Create civic work from inspection"><div className="drawer-heading"><div><h2>Create civic work from an inspection</h2><p>Choose a reviewed citizen issue, then assign an Executive Engineer and any formal agency dependencies.</p></div><button className="secondary" onClick={() => setCreateOpen(false)} type="button">Close</button></div><div className="eligible-ticket-list">{eligibleTickets.map((ticket) => <button aria-pressed={ticketId === ticket.id} className={ticketId === ticket.id ? "eligible-ticket selected" : "eligible-ticket"} key={ticket.id} onClick={() => setTicketId(ticket.id)} type="button"><span><code>{ticket.referenceNumber}</code><WorkStatus state={ticket.state} /></span><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name}</small></button>)}{eligibleTickets.length === 0 ? <EmptyState title="No reviewed inspections are ready" description="Submitted inspection results will appear here when they are ready for a Project Head decision." /> : null}</div>{ticketId ? <ProjectCreateClient onCreated={() => void load()} ticketId={ticketId} /> : null}</section> : null}

    <div className="ph-registry-controls"><span>{dueFilter ? (dueFilter === "overdue" ? "Past planned end date" : "Starting in the next 7 days") : legacyView ? "Filtered from Today" : "Agency work registry"}{dueFilter || legacyView ? <button className="ph-text-action" onClick={() => changeView("ALL")} type="button">Clear filter</button> : null}</span><label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="deadline">Next deadline</option><option value="title">Name (A–Z)</option></select></label></div>
    {loading ? <p role="status">Loading agency works…</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}

    <section className="ph-work-rows" aria-live="polite" aria-label="Agency works">
      {visible.map((row) => { const due = deadline(row); const group = lifecycleGroup(row.kind, row.state); return <article className="ph-registry-row" key={row.kind + row.id}>
        <div className="ph-registry-identity"><button className="ph-text-action" onClick={() => setQuickRecord({id: row.id, kind: row.kind})} type="button"><WorkSummary reference={row.reference} title={row.title} location={row.location} /></button><div className="ph-work-tags">{row.category ? <span>{row.category}</span> : null}<span>{originLabel(row.origin)}</span></div></div>
        <div className="ph-registry-state"><span className={"ph-lifecycle-badge " + group.toLowerCase()}>{row.state === "CANCELLED" ? "Cancelled" : views.find((item) => item.id === group)?.label}</span><small>{row.state.replaceAll("_", " ").toLowerCase()}</small></div>
        <div className="ph-registry-owner"><span>{row.agency}</span><strong>{row.owner}</strong><small>Responsible engineer / agency</small></div>
        <div className="ph-registry-dates">{row.plannedStart && row.plannedEnd ? <span>{new Date(row.plannedStart).toLocaleDateString("en-IN")} – {new Date(row.plannedEnd).toLocaleDateString("en-IN")}</span> : <span>{due.label === "Not set" ? "Dates not set" : due.label}</span>}{row.dependencyCount ? <Link href="/project-head/dependencies">{row.dependencyCount} dependencies</Link> : null}{row.conflictCount ? <Link href="/project-head/conflicts">{row.conflictCount} advisory conflicts</Link> : null}</div>
        <button className="ph-text-action" onClick={() => setQuickRecord({id: row.id, kind: row.kind})} type="button">View work <span aria-hidden="true">&rarr;</span></button>
      </article>; })}
      {!loading && !visible.length ? <EmptyState title="No work in this lifecycle" description="Choose another lifecycle tab to browse agency work." /> : null}
    </section>
    <div className="ph-pipeline-footer"><span>Showing {visible.length ? (effectivePage - 1) * pageSize + 1 : 0}–{Math.min(effectivePage * pageSize, filtered.length)} of {filtered.length} records</span><PaginationControls page={effectivePage} totalPages={totalPages} onPageChange={setPage} /></div>
    <ProjectHeadRecordQuickView onChanged={() => void load()} onClose={() => setQuickRecord(undefined)} record={quickRecord} />
  </div>;
}
