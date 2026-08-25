"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem, ProjectState } from "@civicos/shared";
import { apiFetch, getSession } from "../_lib/api";
import { PaginationControls, PrimaryButton, TicketCard } from "../../_components/ui";

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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const query = new URLSearchParams({ scope });
    query.set("page", String(page)); query.set("limit", "20");
    if (agency) query.set("agency", agency);
    if (status) query.set("status", status);
    try { const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query.toString()}`); setProjects(result.projects); setPagination(result.pagination); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load projects"); }
    finally { setLoading(false); }
  }, [agency, page, scope, status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (scope === "geographic") void apiFetch<{ agencies: Array<{ id: string; name: string }> }>("/agencies").then((result) => setAgencies(result.agencies)).catch(() => setAgencies([])); }, [scope]);
  const accept = async (id: string) => {
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept project"); }
  };
  const currentUserId = getSession()?.user.id;
  return <><header className="portal-heading"><div><p className="eyebrow">Executive Engineer</p><h1>{title}</h1><p>{description}</p>{scope === "geographic" ? <small className="portal-muted">List view retained for the SIH release; the map is documented as deferred.</small> : null}</div></header>{scope === "geographic" ? <section className="filter-bar engineer-filters"><label>Agency<select value={agency} onChange={(event) => { setAgency(event.target.value); setPage(1); }}><option value="">All agencies</option>{agencies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{(["PENDING_UPTAKE", "UPTAKEN", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"] satisfies ProjectState[]).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section> : null}{error ? <p className="error" role="alert">{error}</p> : null}<section className="cv-ticket-grid">{projects.map((project) => { const editable = project.editable ?? project.engineerId === currentUserId; return <TicketCard action={scope === "assigned" && editable && project.state === "PENDING_UPTAKE" ? <PrimaryButton type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void accept(project.id); }}>Accept / uptake</PrimaryButton> : undefined} category={project.agency.name} date={project.updatedAt} href={`/engineer/projects/${project.id}`} id={project.ticket?.id ?? project.id} key={project.id} meta={`${project.ticket?.ward.name ?? "Ward unavailable"} · ${daysRemaining(project.plannedEnd)}${editable ? "" : " · Read-only"}`} status={project.state} title={project.ticket?.title ?? "Standalone project"} />; })}{!loading && projects.length === 0 ? <div className="empty-state"><strong>No projects in this view.</strong></div> : null}{loading ? <p className="portal-muted">Loading projects…</p> : null}</section><PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></>;
}
