"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaginationMeta, ProjectHeadTicketSummary, ProjectListItem, ProjectState, TicketState } from "@civicos/shared";
import { EmptyState, PageHeader, PaginationControls } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { WorkStatus } from "../_components/work-ui";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";
import { ProjectCreateClient } from "./new/project-create-client";

type WorkView = "ALL" | "INTAKE" | "READY" | "ACTIVE" | "CLOSURE" | "CLOSED";

type WorkRow = {
  id: string;
  kind: "ticket" | "project";
  title: string;
  reference: string;
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
};

const views: Array<{ id: WorkView; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "INTAKE", label: "Intake" },
  { id: "READY", label: "Ready" },
  { id: "ACTIVE", label: "Active" },
  { id: "CLOSURE", label: "Closure" },
  { id: "CLOSED", label: "Closed" },
];

async function loadAllTickets(): Promise<ProjectHeadTicketSummary[]> {
  const first = await apiFetch<{ tickets: ProjectHeadTicketSummary[]; pagination: PaginationMeta }>("/tickets?page=1&limit=50");
  if (first.pagination.totalPages <= 1) return first.tickets;
  const remaining = await Promise.all(Array.from({ length: first.pagination.totalPages - 1 }, (_, index) => apiFetch<{ tickets: ProjectHeadTicketSummary[] }>(`/tickets?page=${index + 2}&limit=50`)));
  return [first.tickets, ...remaining.map((page) => page.tickets)].flat();
}

function viewFor(row: WorkRow): Exclude<WorkView, "ALL"> {
  if (row.kind === "ticket") return row.state === "INSPECTION_COMPLETE" ? "READY" : "INTAKE";
  if (row.state === "CREATED") return "READY";
  if (["COMPLETED", "AWAITING_VERIFICATION"].includes(row.state)) return "CLOSURE";
  if (["CLOSED", "CANCELLED"].includes(row.state)) return "CLOSED";
  return "ACTIVE";
}

function rowAction(row: WorkRow): { label: string; href: string } {
  if (row.grievanceId) return { label: "Review issue", href: `/project-head/grievances?grievance=${row.grievanceId}` };
  if (row.kind === "ticket" && ["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(row.state)) return { label: "Inspect", href: `/project-head/tickets/${row.id}` };
  if (row.kind === "ticket") return { label: "Create work", href: `/project-head/projects?ticketId=${row.id}` };
  if (row.state === "CREATED" && row.ticketId) return { label: "Assign engineer", href: `/project-head/projects?ticketId=${row.ticketId}` };
  if (["COMPLETED", "AWAITING_VERIFICATION"].includes(row.state)) return { label: "Review completion", href: `/project-head/projects/${row.id}` };
  return { label: "Open work", href: `/project-head/projects/${row.id}` };
}

function deadlineText(row: WorkRow): string {
  if (!row.deadline) return "No deadline recorded";
  const deadline = new Date(row.deadline);
  const overdue = deadline.getTime() < Date.now() && viewFor(row) !== "CLOSED";
  return `${overdue ? "Overdue" : "Due"} ${deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

function WorkPage({ initialView = "ALL" }: { initialView?: WorkView }) {
  const router = useRouter();
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [view, setView] = useState<WorkView>(initialView);
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
      setError(reason instanceof Error ? reason.message : "Could not load civic work");
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
      location: ticket.ward.name,
      category: ticket.category.name,
      state: ticket.inspectionDue ? "INSPECTION_DUE" : ticket.state,
      owner: ticket.action?.responsibleUser.email ?? ticket.assignedAgency?.name ?? "Agency queue",
      deadline: ticket.action?.deadline,
      updatedAt: ticket.validatedAt ?? ticket.createdAt,
      grievanceId: ticket.grievance?.id,
      ticketId: ticket.id,
      dependencyCount: 0,
    }));
    const projectRows = projects.map((project): WorkRow => ({
      id: project.id,
      kind: "project",
      title: project.ticket?.title ?? project.title,
      reference: project.referenceNumber,
      location: project.locationLabel ?? project.ticket?.ward.name ?? "Location pending",
      state: project.state,
      owner: project.engineer?.email ?? "Unassigned",
      deadline: project.action?.deadline ?? project.plannedEnd,
      updatedAt: project.updatedAt,
      grievanceId: project.grievance?.id,
      ticketId: project.ticketId ?? undefined,
      projectId: project.id,
      dependencyCount: project.dependencyCount,
    }));
    return [...ticketRows, ...projectRows].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [projects, tickets]);

  const counts = useMemo(() => new Map(views.map(({ id }) => [id, id === "ALL" ? rows.length : rows.filter((row) => viewFor(row) === id).length])), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (view === "ALL" || viewFor(row) === view) && (!query || [row.title, row.reference, row.location, row.category, row.owner].some((value) => value?.toLowerCase().includes(query))));
  }, [rows, search, view]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const eligibleTickets = tickets.filter((ticket) => ["INSPECTION_COMPLETE", "PROJECT_CREATED"].includes(ticket.state));

  const changeView = (next: WorkView) => { setView(next); setPage(1); };

  return <div className="ph-work-page">
    <PageHeader title="Work" description="Track civic work from inspection through delivery, verification, and closure." action={<Link className="portal-primary-button" href="/project-head/tickets/new">+ New ticket</Link>} />
    <div aria-label="Work lifecycle views" className="portal-tabs ph-work-tabs" role="tablist">{views.map((item) => <button aria-selected={view === item.id} key={item.id} onClick={() => changeView(item.id)} role="tab" type="button">{item.label} <span>{counts.get(item.id) ?? 0}</span></button>)}</div>

    {createOpen ? <section className="portal-inline-drawer project-ready-drawer" aria-label="Set up civic work"><div className="drawer-heading"><div><h2>Set up inspected work</h2><p>Choose an eligible issue, then assign an Executive Engineer and any formal agency dependencies.</p></div><button className="secondary" onClick={() => setCreateOpen(false)} type="button">Close</button></div><div className="eligible-ticket-list">{eligibleTickets.map((ticket) => <button aria-pressed={ticketId === ticket.id} className={ticketId === ticket.id ? "eligible-ticket selected" : "eligible-ticket"} key={ticket.id} onClick={() => setTicketId(ticket.id)} type="button"><span><code>{ticket.referenceNumber}</code><WorkStatus state={ticket.state} /></span><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name}</small></button>)}{eligibleTickets.length === 0 ? <EmptyState title="No tickets are ready" description="Complete an inspection and the work will appear here automatically." /> : null}</div>{ticketId ? <ProjectCreateClient onCreated={() => void load()} ticketId={ticketId} /> : null}</section> : null}

    <section aria-label="Work filters" className="ph-work-toolbar"><label><span>Search work</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Reference, title, ward, engineer or agency" /></label><button className="ph-secondary-button" onClick={() => setCreateOpen((open) => !open)} type="button">Set up inspected work</button></section>
    {error ? <p className="error" role="alert">{error}</p> : null}

    <section className="ph-work-register" aria-live="polite">
      <div className="table-scroll"><table><thead><tr><th>Work</th><th>Stage</th><th>Responsible</th><th>Deadline / coordination</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{visible.map((row) => {
        const action = rowAction(row);
        const canonicalHref = row.kind === "ticket" ? `/project-head/tickets/${row.id}` : `/project-head/projects/${row.id}`;
        return <tr key={`${row.kind}:${row.id}`}><td><Link className="ph-work-title-link" href={canonicalHref}><strong>{row.title}</strong><small>{row.reference} · {row.location}{row.category ? ` · ${row.category}` : ""}</small></Link></td><td><WorkStatus state={row.state} /></td><td>{row.owner}</td><td className={row.deadline && new Date(row.deadline).getTime() < Date.now() && viewFor(row) !== "CLOSED" ? "deadline-overdue" : ""}>{deadlineText(row)}{row.dependencyCount > 0 ? <small>{row.dependencyCount} connected agenc{row.dependencyCount === 1 ? "y" : "ies"}</small> : null}</td><td><div className="ph-row-actions"><Link className="ph-row-action" href={action.href}>{action.label} →</Link>{action.href !== canonicalHref ? <details className="ph-action-menu"><summary aria-label={`More actions for ${row.title}`}>•••</summary><div><Link href={canonicalHref}>Open record</Link></div></details> : null}</div></td></tr>;
      })}</tbody></table></div>
      {visible.length === 0 ? <EmptyState title="No work matches this view" description="Change the lifecycle view or search term. New validated work appears automatically." /> : null}
    </section>
    <PaginationControls page={Math.min(page, totalPages)} totalPages={totalPages} onPageChange={setPage} />
  </div>;
}

export default function ProjectsPage() {
  return <WorkPage />;
}
