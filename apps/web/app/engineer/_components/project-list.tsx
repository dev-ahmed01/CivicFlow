"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectListItem, ProjectState } from "@civicos/shared";
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
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const query = new URLSearchParams({ scope });
    if (agency) query.set("agency", agency);
    if (status) query.set("status", status);
    try { setProjects((await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }> }>(`/projects?${query.toString()}`)).projects); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load projects"); }
    finally { setLoading(false); }
  }, [agency, scope, status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (scope === "geographic") void apiFetch<{ agencies: Array<{ id: string; name: string }> }>("/agencies").then((result) => setAgencies(result.agencies)).catch(() => setAgencies([])); }, [scope]);
  const accept = async (id: string) => {
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept project"); }
  };
  const currentUserId = getSession()?.user.id;
  return <><header className="portal-heading"><div><p className="eyebrow">Executive Engineer</p><h1>{title}</h1><p>{description}</p>{scope === "geographic" ? <small className="portal-muted">List view available now · Map is a fast-follow.</small> : null}</div></header>{scope === "geographic" ? <section className="filter-bar engineer-filters"><label>Agency<select value={agency} onChange={(event) => setAgency(event.target.value)}><option value="">All agencies</option>{agencies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{(["PENDING_UPTAKE", "UPTAKEN", "ACTIVE", "COMPLETED", "AWAITING_VERIFICATION", "CLOSED"] satisfies ProjectState[]).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section> : null}{error ? <p className="error" role="alert">{error}</p> : null}<section className="engineer-project-grid">{projects.map((project) => { const editable = project.editable ?? project.engineerId === currentUserId; return <article className="engineer-project-card" key={project.id}><div><p className="eyebrow">{project.agency.name}</p><span className="state-chip">{project.state.replaceAll("_", " ")}</span></div><h2>{project.ticket?.title ?? "Standalone project"}</h2><p>{project.ticket?.ward.name ?? "Ward unavailable"} · {daysRemaining(project.plannedEnd)}</p>{!editable ? <small className="read-only-note">Read-only · Owned by another engineer or agency</small> : null}<div className="engineer-card-actions"><Link href={`/engineer/projects/${project.id}`}>View project</Link>{scope === "assigned" && editable && project.state === "PENDING_UPTAKE" ? <button type="button" onClick={() => void accept(project.id)}>Accept / Uptake</button> : null}</div></article>; })}{!loading && projects.length === 0 ? <div className="empty-state"><strong>No projects in this view.</strong></div> : null}{loading ? <p className="portal-muted">Loading projects…</p> : null}</section></>;
}
