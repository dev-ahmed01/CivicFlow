"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CivicWorkOrigin, PaginationMeta, ProjectHeadTicketSummary, ProjectListItem, ProjectState, TicketState } from "@civicos/shared";
import { EmptyState, PageHeader, PaginationControls } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { WorkStatus } from "../_components/work-ui";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";
import { ProjectCreateClient } from "./new/project-create-client";
import { pipelineStage, type WorkView } from "./pipeline";

type OriginFilter = "ALL" | "CITIZEN_REPORTED" | "AGENCY_PLANNED";
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
  deadline?: Date | string | null;
  updatedAt: Date | string;
  grievanceId?: string;
  ticketId?: string;
  projectId?: string;
  dependencyCount: number;
  conflictCount: number;
  coordinationCount: number;
};

const views: Array<{ id: WorkView; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "INTAKE", label: "Intake" },
  { id: "INSPECTION", label: "Inspection" },
  { id: "READY", label: "Ready" },
  { id: "SCHEDULED", label: "Scheduled" },
  { id: "ACTIVE", label: "Active" },
  { id: "CLOSURE", label: "Closure" },
  { id: "CLOSED", label: "Closed" },
];

async function loadAllTickets(): Promise<ProjectHeadTicketSummary[]> {
  const first = await apiFetch<{ tickets: ProjectHeadTicketSummary[]; pagination: PaginationMeta }>("/tickets?page=1&limit=50");
  if (first.pagination.totalPages <= 1) return first.tickets;
  const remaining = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => apiFetch<{ tickets: ProjectHeadTicketSummary[] }>(`/tickets?page=${index + 2}&limit=50`)));
  return [first.tickets, ...remaining.map((result) => result.tickets)].flat();
}

function rowAction(row: WorkRow): { label: string; href: string } {
  if (row.grievanceId) return { label: "Review issue", href: `/project-head/grievances?grievance=${row.grievanceId}` };
  if (row.kind === "ticket" && ["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(row.state)) return { label: "Assign Inspection", href: `/project-head/tickets/${row.id}` };
  if (row.kind === "ticket") return { label: "Review Inspection", href: `/project-head/tickets/${row.id}` };
  if (row.state === "CREATED") return { label: "Assign Engineer", href: `/project-head/projects/${row.id}` };
  if (row.state === "CONFLICT_CHECKED" && row.conflictCount > row.coordinationCount) return { label: "Open Coordination", href: "/project-head/conflicts" };
  if (["COMPLETED", "AWAITING_VERIFICATION"].includes(row.state)) return { label: "Review Completion", href: `/project-head/projects/${row.id}` };
  return { label: "Open Work", href: `/project-head/projects/${row.id}` };
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
  const [view, setView] = useState<WorkView>("ALL");
  const [origin, setOrigin] = useState<OriginFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");

  const load = useCallback(async () => {
    try {
      const [ticketResult, projectResult] = await Promise.all([loadAllTickets(), loadAllAgencyProjects()]);
      setTickets(ticketResult);
      setProjects(projectResult);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the work pipeline");
    }
  }, []);
  usePortalPolling(load);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedView = query.get("view")?.toUpperCase();
    const requestedTicket = query.get("ticketId");
    const requestedProject = query.get("project");
    if (requestedProject) { router.replace(`/project-head/projects/${requestedProject}`); return; }
    if (requestedView && views.some(({ id }) => id === requestedView)) setView(requestedView as WorkView);
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
      location: ticket.ward.name,
      category: ticket.category.name,
      state: ticket.inspectionDue ? "INSPECTION_DUE" : ticket.state,
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
      title: project.ticket?.title ?? project.title,
      reference: project.referenceNumber,
      origin: project.origin,
      location: project.locationLabel ?? project.ticket?.ward.name ?? "Location pending",
      state: project.state,
      owner: project.engineer?.email ?? "Unassigned",
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

  const counts = useMemo(() => new Map(views.map(({ id }) => [id, id === "ALL" ? rows.length : rows.filter((row) => pipelineStage(row.kind, row.state) === id).length])), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) =>
      (view === "ALL" || pipelineStage(row.kind, row.state) === view)
      && (origin === "ALL" || row.origin === origin)
      && (!query || [row.title, row.reference, row.location, row.category, row.owner].some((value) => value?.toLowerCase().includes(query))),
    );
  }, [origin, rows, search, view]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const visible = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
  const eligibleTickets = tickets.filter((ticket) => ["INSPECTION_COMPLETE", "PROJECT_CREATED"].includes(ticket.state));

  const changeView = (next: WorkView) => { setView(next); setPage(1); };

  return <div className="ph-work-page">
    <PageHeader title="Work Pipeline" description="Drive citizen issues and agency-planned work from intake to verified closure." action={<Link className="portal-primary-button" href="/project-head/projects/new">+ Register Planned Work</Link>} />
    <div aria-label="Work lifecycle stages" className="portal-tabs ph-work-tabs" role="tablist">{views.map((item) => <button aria-selected={view === item.id} key={item.id} onClick={() => changeView(item.id)} role="tab" type="button">{item.label}<span>{counts.get(item.id) ?? 0}</span></button>)}</div>

    {createOpen ? <section className="portal-inline-drawer project-ready-drawer" aria-label="Create civic work from inspection"><div className="drawer-heading"><div><h2>Create civic work from an inspection</h2><p>Choose a reviewed citizen issue, then assign an Executive Engineer and any formal agency dependencies.</p></div><button className="secondary" onClick={() => setCreateOpen(false)} type="button">Close</button></div><div className="eligible-ticket-list">{eligibleTickets.map((ticket) => <button aria-pressed={ticketId === ticket.id} className={ticketId === ticket.id ? "eligible-ticket selected" : "eligible-ticket"} key={ticket.id} onClick={() => setTicketId(ticket.id)} type="button"><span><code>{ticket.referenceNumber}</code><WorkStatus state={ticket.state} /></span><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name}</small></button>)}{eligibleTickets.length === 0 ? <EmptyState title="No reviewed inspections are ready" description="Submitted inspection results will appear here when they are ready for a Project Head decision." /> : null}</div>{ticketId ? <ProjectCreateClient onCreated={() => void load()} ticketId={ticketId} /> : null}</section> : null}

    <section aria-label="Work filters" className="ph-work-toolbar"><label><span>Search work</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Reference, title, location or responsible person" /></label><label><span>Origin</span><select value={origin} onChange={(event) => { setOrigin(event.target.value as OriginFilter); setPage(1); }}><option value="ALL">All origins</option><option value="CITIZEN_REPORTED">Citizen issues</option><option value="AGENCY_PLANNED">Agency planned</option></select></label><button className="ph-secondary-button" onClick={() => setCreateOpen((open) => !open)} type="button">Create from Inspection</button></section>
    {error ? <p className="error" role="alert">{error}</p> : null}

    <section className="ph-pipeline-register" aria-live="polite">
      <div className="table-scroll"><table><thead><tr><th>Reference / work</th><th>Origin / location</th><th>Stage</th><th>Responsible</th><th>Deadline</th><th>Dependencies</th><th>Conflict</th><th><span className="sr-only">Next action</span></th></tr></thead><tbody>{visible.map((row) => {
        const action = rowAction(row);
        const due = deadline(row);
        const stage = pipelineStage(row.kind, row.state);
        const conflictOpen = Math.max(0, row.conflictCount - row.coordinationCount);
        return <tr data-risk={due.overdue ? "danger" : conflictOpen ? "warning" : "standard"} key={`${row.kind}:${row.id}`}>
          <td data-label="Work"><Link className="ph-work-title-link" href={row.kind === "ticket" ? `/project-head/tickets/${row.id}` : `/project-head/projects/${row.id}`}><code>{row.reference}</code><strong>{row.title}</strong></Link></td>
          <td data-label="Origin / location"><strong>{originLabel(row.origin)}</strong><small>{row.location}{row.category ? ` · ${row.category}` : ""}</small></td>
          <td data-label="Stage"><span className={`ph-stage-label stage-${stage.toLowerCase()}`}>{stage[0]}{stage.slice(1).toLowerCase()}</span><small>{row.state.replaceAll("_", " ").toLowerCase()}</small></td>
          <td data-label="Responsible">{row.owner}</td>
          <td className={due.overdue ? "deadline-overdue" : ""} data-label="Deadline">{due.label}</td>
          <td data-label="Dependencies">{row.dependencyCount ? <Link href="/project-head/dependencies">{row.dependencyCount} linked →</Link> : <span>None</span>}</td>
          <td data-label="Conflict">{row.conflictCount ? <span className="ph-conflict-indicator"><strong>{row.conflictCount} warning{row.conflictCount === 1 ? "" : "s"}</strong><small>{conflictOpen ? `${conflictOpen} needs coordination` : "Coordination linked"}</small></span> : <span className="ph-no-conflict">None</span>}</td>
          <td data-label="Next action"><Link className="ph-pipeline-action" href={action.href}>{action.label}<span aria-hidden="true">→</span></Link></td>
        </tr>;
      })}</tbody></table></div>
      {visible.length === 0 ? <EmptyState title="No work matches this stage" description="Change the lifecycle stage, origin, or search term. Persisted work appears automatically." /> : null}
    </section>
    <div className="ph-pipeline-footer"><span>Showing {visible.length ? (effectivePage - 1) * pageSize + 1 : 0}–{Math.min(effectivePage * pageSize, filtered.length)} of {filtered.length} records</span><PaginationControls page={effectivePage} totalPages={totalPages} onPageChange={setPage} /></div>
  </div>;
}
