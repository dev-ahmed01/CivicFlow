"use client";

import { Fragment, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { ActionButton, PaginationControls, PortalStatePill } from "../../_components/ui";
import { apiFetch } from "../_lib/api";
import { ProjectDetailClient } from "./[id]/project-detail-client";
import { ProjectCreateClient } from "./new/project-create-client";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [expandedId, setExpandedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");

  useEffect(() => {
    void apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>(`/projects?page=${page}&limit=20`).then((result) => { setProjects(result.projects); setPagination(result.pagination); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load projects"));
  }, [page]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedProject = query.get("project");
    const requestedTicket = query.get("ticketId");
    if (requestedProject) setExpandedId(requestedProject);
    if (requestedTicket) { setTicketId(requestedTicket); setCreateOpen(true); }
  }, []);

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Agency delivery</p><h1>Projects</h1><p>Compare delivery status, ownership, and location without leaving the queue.</p></div><button aria-expanded={createOpen} className="portal-primary-button" onClick={() => setCreateOpen((open) => !open)} type="button">{createOpen ? "Close project form" : "New project"}</button></header>
    {createOpen ? <section className="portal-inline-drawer"><div className="portal-inline-prompt"><label>Inspected ticket ID<input placeholder="Paste the inspected ticket ID" value={ticketId} onChange={(event) => setTicketId(event.target.value.trim())} /></label><p>Project creation remains tied to an inspected ticket and is validated by the existing API.</p></div>{ticketId ? <ProjectCreateClient ticketId={ticketId} /> : null}</section> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card portal-work-table"><div className="table-scroll"><table><thead><tr><th>Project</th><th>Ticket / work</th><th>Ward</th><th>Engineer</th><th>Status</th><th>Action</th></tr></thead><tbody>{projects.map((project) => {
      const expanded = expandedId === project.id;
      return <Fragment key={project.id}><tr className={expanded ? "expanded" : ""}><td><code>{project.id.slice(0, 8)}</code></td><td>{project.ticket?.title ?? "Standalone project"}</td><td>{project.ticket?.ward.name ?? "—"}</td><td>{project.engineer?.email ?? "Unassigned"}</td><td><PortalStatePill state={project.state} /></td><td><ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : project.id)}>{expanded ? "Close" : "View"}</ActionButton></td></tr>{expanded ? <tr className="portal-inline-row"><td colSpan={6}><div className="portal-reveal"><ProjectDetailClient projectId={project.id} /><div className="portal-deep-link"><ActionButton href={`/project-head/projects/${project.id}`}>Open full page</ActionButton></div></div></td></tr> : null}</Fragment>;
    })}</tbody></table></div>{projects.length === 0 ? <div className="empty-state"><strong>No projects yet.</strong><span>Complete a ticket inspection to create one.</span></div> : null}</section>
    {expandedId && !projects.some((project) => project.id === expandedId) ? <section className="portal-detached-reveal"><ProjectDetailClient projectId={expandedId} /><ActionButton onClick={() => setExpandedId(undefined)}>Close</ActionButton></section> : null}
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
