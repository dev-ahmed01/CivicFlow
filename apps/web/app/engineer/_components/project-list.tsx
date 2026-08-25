"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem, ProjectState } from "@civicos/shared";
import { ActionButton, PaginationControls, PortalStatePill, PrimaryButton } from "../../_components/ui";
import { EngineerProjectDetailClient } from "../projects/[id]/project-detail-client";
import { apiFetch, getSession } from "../_lib/api";

function daysRemaining(end: string | Date | null): string {
  if (!end) return "Timeline not set";
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`;
}

export function EngineerProjectList({ scope, title, description }: { scope: "mine" | "assigned" | "geographic"; title: string; description: string }) {
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([]);
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const query = new URLSearchParams({ scope, page: String(page), limit: "20" });
    if (agency) query.set("agency", agency);
    if (status) query.set("status", status);
    try {
      const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query.toString()}`);
      setProjects(result.projects);
      setPagination(result.pagination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [agency, page, scope, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (scope === "geographic") void apiFetch<{ agencies: Array<{ id: string; name: string }> }>("/agencies").then((result) => setAgencies(result.agencies)).catch(() => setAgencies([]));
  }, [scope]);
  useEffect(() => {
    const requestedProject = new URLSearchParams(window.location.search).get("project");
    if (requestedProject) setExpandedId(requestedProject);
  }, []);

  const accept = async (id: string) => {
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept project"); }
  };
  const currentUserId = getSession()?.user.id;

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Executive Engineer</p><h1>{title}</h1><p>{description}</p>{scope === "geographic" ? <small className="portal-muted">List view retained for the SIH release; the map is documented as deferred.</small> : null}</div></header>
    {scope === "geographic" ? <section className="filter-bar engineer-filters"><label>Agency<select value={agency} onChange={(event) => { setAgency(event.target.value); setPage(1); }}><option value="">All agencies</option>{agencies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{(["PENDING_UPTAKE", "UPTAKEN", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"] satisfies ProjectState[]).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card portal-work-table"><div className="table-scroll"><table><thead><tr><th>Project</th><th>Work</th><th>Agency</th><th>Ward</th><th>Timeline</th><th>Status</th><th>Action</th></tr></thead><tbody>{projects.map((project) => {
      const editable = project.editable ?? project.engineerId === currentUserId;
      const expanded = expandedId === project.id;
      return <Fragment key={project.id}><tr className={`${expanded ? "expanded" : ""} ${daysRemaining(project.plannedEnd).includes("overdue") ? "overdue-row" : ""}`}><td><code>{project.id.slice(0, 8)}</code></td><td><strong>{project.ticket?.title ?? "Standalone project"}</strong>{!editable ? <small className="table-note">Read-only</small> : null}</td><td>{project.agency.name}</td><td>{project.ticket?.ward.name ?? "—"}</td><td>{daysRemaining(project.plannedEnd)}</td><td><PortalStatePill state={project.state} /></td><td><div className="portal-row-actions">{scope === "assigned" && editable && project.state === "PENDING_UPTAKE" ? <PrimaryButton type="button" onClick={() => void accept(project.id)}>Accept</PrimaryButton> : null}<ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : project.id)}>{expanded ? "Close" : "View"}</ActionButton></div></td></tr>{expanded ? <tr className="portal-inline-row"><td colSpan={7}><div className="portal-reveal"><EngineerProjectDetailClient projectId={project.id} /><div className="portal-deep-link"><ActionButton href={`/engineer/projects/${project.id}`}>Open full page</ActionButton></div></div></td></tr> : null}</Fragment>;
    })}</tbody></table></div>{!loading && projects.length === 0 ? <div className="empty-state"><strong>No projects in this view.</strong></div> : null}{loading ? <p className="portal-muted portal-table-loading">Loading projects…</p> : null}</section>
    {expandedId && !projects.some((project) => project.id === expandedId) ? <section className="portal-detached-reveal"><EngineerProjectDetailClient projectId={expandedId} /><ActionButton onClick={() => setExpandedId(undefined)}>Close</ActionButton></section> : null}
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
