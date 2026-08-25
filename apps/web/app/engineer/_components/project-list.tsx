"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { ActionButton, PaginationControls, PortalStatePill, PrimaryButton } from "../../_components/ui";
import { EngineerProjectDetailClient } from "../projects/[id]/project-detail-client";
import { apiFetch, getSession } from "../_lib/api";

type WorkView = "mine" | "assigned";

function daysRemaining(end: string | Date | null): string {
  if (!end) return "Timeline not set";
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`;
}

export function EngineerProjectList() {
  const [view, setView] = useState<WorkView>("mine");
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({ scope: view, page: String(page), limit: "20" });
      const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query.toString()}`);
      setProjects(result.projects);
      setPagination(result.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [page, view]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("view") === "assigned") setView("assigned");
    const requestedProject = query.get("project");
    if (requestedProject) setExpandedId(requestedProject);
  }, []);

  const changeView = (nextView: WorkView) => {
    setView(nextView);
    setPage(1);
    setExpandedId(undefined);
  };
  const accept = async (id: string) => {
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept project"); }
  };
  const currentUserId = getSession()?.user.id;

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Executive Engineer</p><h1>Projects</h1><p>Accept new assignments and manage active delivery from one workspace.</p></div></header>
    <div aria-label="Project views" className="engineer-work-tabs" role="tablist">
      <button aria-controls="engineer-project-results" aria-selected={view === "mine"} className={view === "mine" ? "active" : ""} onClick={() => changeView("mine")} role="tab" type="button">Active work</button>
      <button aria-controls="engineer-project-results" aria-selected={view === "assigned"} className={view === "assigned" ? "active" : ""} onClick={() => changeView("assigned")} role="tab" type="button">Awaiting acceptance</button>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" className="table-card portal-work-table" id="engineer-project-results" role="tabpanel" tabIndex={0}>
      <div className="table-scroll"><table><thead><tr><th>Project</th><th>Work</th><th>Agency</th><th>Ward</th><th>Timeline</th><th>Status</th><th>Action</th></tr></thead><tbody>{projects.map((project) => {
        const editable = project.editable ?? project.engineerId === currentUserId;
        const expanded = expandedId === project.id;
        return <Fragment key={project.id}><tr className={`${expanded ? "expanded" : ""} ${daysRemaining(project.plannedEnd).includes("overdue") ? "overdue-row" : ""}`}><td><code>{project.id.slice(0, 8)}</code></td><td><strong>{project.ticket?.title ?? "Standalone project"}</strong>{!editable ? <small className="table-note">Read-only</small> : null}</td><td>{project.agency.name}</td><td>{project.ticket?.ward.name ?? "—"}</td><td>{daysRemaining(project.plannedEnd)}</td><td><PortalStatePill state={project.state} /></td><td><div className="portal-row-actions">{view === "assigned" && editable && project.state === "PENDING_UPTAKE" ? <PrimaryButton type="button" onClick={() => void accept(project.id)}>Accept</PrimaryButton> : null}<ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : project.id)}>{expanded ? "Close" : "View"}</ActionButton></div></td></tr>{expanded ? <tr className="portal-inline-row"><td colSpan={7}><div className="portal-reveal"><EngineerProjectDetailClient projectId={project.id} /><div className="portal-deep-link"><ActionButton href={`/engineer/projects/${project.id}`}>Open full page</ActionButton></div></div></td></tr> : null}</Fragment>;
      })}</tbody></table></div>
      {!loading && projects.length === 0 ? <div className="empty-state"><strong>{view === "mine" ? "No active projects." : "No assignments are waiting for acceptance."}</strong></div> : null}
      {loading ? <p className="portal-muted portal-table-loading">Loading projects…</p> : null}
    </section>
    {expandedId && !projects.some((project) => project.id === expandedId) ? <section className="portal-detached-reveal"><EngineerProjectDetailClient projectId={expandedId} /><ActionButton onClick={() => setExpandedId(undefined)}>Close</ActionButton></section> : null}
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
