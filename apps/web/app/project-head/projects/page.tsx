"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectHeadTicketSummary, ProjectListItem } from "@civicos/shared";
import { NextActionButton, ProjectActionCard } from "../../_components/operations";
import { ActionButton, PaginationControls, PortalStatePill } from "../../_components/ui";
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
      setError(reason instanceof Error ? reason.message : "Could not load projects");
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

  const startProject = (selectedTicketId: string) => {
    setTicketId(selectedTicketId);
    setCreateOpen(true);
  };

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Agency delivery</p><h1>Projects</h1><p>Create, assign, and track delivery from an action-ready queue.</p></div><button aria-expanded={createOpen} className="portal-primary-button" onClick={() => setCreateOpen((open) => !open)} type="button">{createOpen ? "Close project workflow" : "Create or assign project"}</button></header>
    {createOpen ? <section className="portal-inline-drawer project-ready-drawer"><div className="drawer-heading"><div><p className="eyebrow">Eligible tickets</p><h2>Choose inspected work</h2><p>The queue is loaded from your agency’s authoritative ticket states—no ticket ID entry required.</p></div><PortalStatePill state={`${eligibleTickets.length} READY`} /></div><div className="eligible-ticket-grid">{eligibleTickets.map((ticket) => <button aria-pressed={ticketId === ticket.id} className={ticketId === ticket.id ? "eligible-ticket selected" : "eligible-ticket"} key={ticket.id} onClick={() => setTicketId(ticket.id)} type="button"><span><PortalStatePill state={ticket.state} /><code>{ticket.referenceNumber}</code></span><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name}</small><b>{ticket.state === "PROJECT_CREATED" ? "Assign Engineer →" : "Create Project →"}</b></button>)}{eligibleTickets.length === 0 ? <div className="empty-state"><strong>No tickets are ready.</strong><span>Complete an inspection and the ticket will appear here automatically.</span></div> : null}</div>{ticketId ? <ProjectCreateClient onCreated={() => void load()} ticketId={ticketId} /> : null}</section> : null}
    <section aria-label="Project filters" className="filter-bar compact-filter"><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All active states</option>{["CREATED", "PENDING_UPTAKE", "UPTAKEN", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="project-action-grid project-head-project-grid">{projects.map((project) => {
      const expanded = expandedId === project.id;
      const primary = project.state === "CREATED" && project.ticket
        ? <NextActionButton onClick={() => startProject(project.ticket!.id)}>Assign Engineer</NextActionButton>
        : <NextActionButton href={`/project-head/projects/${project.id}`}>{project.state === "AWAITING_VERIFICATION" ? "Track Closure" : "Review Project"}</NextActionButton>;
      return <div className="project-card-stack" key={project.id}><ProjectActionCard action={primary} project={project}><ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : project.id)}>{expanded ? "Hide details" : "Quick view"}</ActionButton></ProjectActionCard>{expanded ? <div className="portal-detached-reveal"><ProjectDetailClient projectId={project.id} /></div> : null}</div>;
    })}{projects.length === 0 ? <div className="empty-state"><strong>No projects match this view.</strong><span>Eligible inspected tickets remain available above.</span></div> : null}</section>
    {expandedId && !projects.some((project) => project.id === expandedId) ? <section className="portal-detached-reveal"><ProjectDetailClient projectId={expandedId} /><ActionButton onClick={() => setExpandedId(undefined)}>Close</ActionButton></section> : null}
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
