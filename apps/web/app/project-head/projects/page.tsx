"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { PaginationMeta, ProjectHeadTicketSummary, ProjectListItem } from "@civicos/shared";
import { NextActionButton } from "../../_components/operations";
import { ActionButton, EmptyState, PageHeader, PaginationControls, PortalStatePill, WorkTabs } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { ProjectDetailClient } from "./[id]/project-detail-client";
import { ProjectCreateClient } from "./new/project-create-client";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [eligibleTickets, setEligibleTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [expandedId, setExpandedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");

  const load = useCallback(async () => {
    try {
      const projectQuery = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) projectQuery.set("status", status);
      const [projectResult, inspectedResult, createdResult] = await Promise.all([
        apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>(`/projects?${projectQuery.toString()}`),
        apiFetch<{ tickets: ProjectHeadTicketSummary[] }>("/tickets?status=INSPECTION_COMPLETE&limit=50"),
        apiFetch<{ tickets: ProjectHeadTicketSummary[] }>("/tickets?status=PROJECT_CREATED&limit=50"),
      ]);
      setProjects(projectResult.projects);
      setPagination(projectResult.pagination);
      setEligibleTickets([...inspectedResult.tickets, ...createdResult.tickets]);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load works");
    }
  }, [page, status]);
  usePortalPolling(load);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedProject = query.get("project");
    const requestedTicket = query.get("ticketId");
    const requestedStatus = query.get("status");
    if (requestedProject) setExpandedId(requestedProject);
    if (requestedTicket) { setTicketId(requestedTicket); setCreateOpen(true); }
    if (requestedStatus) setStatus(requestedStatus);
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => [project.title, project.ticket?.title, project.ticket?.ward.name, project.engineer?.email, project.agency.name].some((value) => value?.toLowerCase().includes(query)));
  }, [projects, search]);

  const startProject = (selectedTicketId: string) => { setTicketId(selectedTicketId); setCreateOpen(true); };

  return <>
    <PageHeader eyebrow="Agency delivery" title="Works" description="Create, assign, and monitor the agency’s delivery work." action={<button aria-expanded={createOpen} className="portal-primary-button" onClick={() => setCreateOpen((open) => !open)} type="button">{createOpen ? "Close setup" : "Create or assign work"}</button>} />
    <WorkTabs active="delivery" />
    {createOpen ? <section className="portal-inline-drawer project-ready-drawer"><div className="drawer-heading"><div><p className="eyebrow">Eligible tickets</p><h2>Choose inspected work</h2><p>Only tickets in an eligible workflow state are shown.</p></div><PortalStatePill state={`${eligibleTickets.length} READY`} /></div><div className="eligible-ticket-list">{eligibleTickets.map((ticket) => <button aria-pressed={ticketId === ticket.id} className={ticketId === ticket.id ? "eligible-ticket selected" : "eligible-ticket"} key={ticket.id} onClick={() => setTicketId(ticket.id)} type="button"><span><code>{ticket.referenceNumber}</code><PortalStatePill state={ticket.state} /></span><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name}</small></button>)}{eligibleTickets.length === 0 ? <EmptyState title="No tickets are ready" description="Complete an inspection and the ticket will appear here automatically." /> : null}</div>{ticketId ? <ProjectCreateClient onCreated={() => void load()} ticketId={ticketId} /> : null}</section> : null}
    <section aria-label="Work filters" className="filter-bar work-filter-bar"><label>Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, ward, engineer or agency" /></label><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All active states</option>{["CREATED", "PENDING_UPTAKE", "UPTAKEN", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card portal-work-table"><div className="table-scroll"><table><thead><tr><th>Work</th><th>Status</th><th>Ward</th><th>Responsible</th><th>Timeline</th><th>Dependencies</th><th>Action</th></tr></thead><tbody>{visibleProjects.map((project) => {
      const expanded = expandedId === project.id;
      return <Fragment key={project.id}><tr className={expanded ? "expanded" : ""}><td><strong>{project.ticket?.title ?? project.title}</strong><small>{project.id.slice(0, 8)}</small></td><td><PortalStatePill state={project.state} /></td><td>{project.ticket?.ward.name ?? "Not recorded"}</td><td>{project.engineer?.email ?? "Unassigned"}</td><td>{project.plannedEnd ? `Due ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Not scheduled"}</td><td>{project.dependencyCount || "None"}</td><td><div className="portal-row-actions">{project.state === "CREATED" && project.ticket ? <NextActionButton onClick={() => startProject(project.ticket!.id)}>Assign</NextActionButton> : <NextActionButton href={`/project-head/projects/${project.id}`}>Open</NextActionButton>}<ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : project.id)}>{expanded ? "Close" : "Preview"}</ActionButton></div></td></tr>{expanded ? <tr className="portal-inline-row"><td colSpan={7}><div className="portal-reveal"><ProjectDetailClient projectId={project.id} /></div></td></tr> : null}</Fragment>;
    })}</tbody></table></div>{visibleProjects.length === 0 ? <EmptyState title="No works match this view" description="Change the search or status filter, or create work from an inspected ticket." /> : null}</section>
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
