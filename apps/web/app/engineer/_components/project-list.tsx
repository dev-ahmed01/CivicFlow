"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { NextActionButton, ProjectActionCard } from "../../_components/operations";
import { PaginationControls } from "../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { getEngineerNextAction } from "../../_lib/workflow-actions";
import { apiFetch, getSession } from "../_lib/api";

type WorkView = "assigned" | "scheduled" | "active" | "completed";
const views: WorkView[] = ["assigned", "scheduled", "active", "completed"];

export function EngineerProjectList() {
  const [view, setView] = useState<WorkView>("scheduled");
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ scope: view === "assigned" ? "assigned" : "mine", page: String(page), limit: "20" });
      if (view !== "assigned") query.set("stage", view);
      const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query}`);
      setProjects(result.projects); setPagination(result.pagination); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load work"); }
    finally { setLoading(false); }
  }, [page, view]);
  usePortalPolling(load);
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get("view"); if (requested === "assigned") setView("assigned"); }, []);
  const changeView = (next: WorkView) => { setView(next); setPage(1); setLoading(true); };
  const accept = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); notifyPortalDataChanged(); setView("scheduled"); setPage(1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept assignment"); }
    finally { setBusyId(undefined); }
  };
  const currentUserId = getSession()?.user.id;
  return <div className="field-module"><header className="portal-heading"><div><p className="eyebrow">Field delivery</p><h1>My Work</h1><p>Move assigned work from acceptance and scheduling into explicit field execution and verified completion.</p></div></header><div aria-label="My Work views" className="engineer-work-tabs" role="tablist">{views.map((item) => <button aria-selected={view === item} className={view === item ? "active" : ""} key={item} onClick={() => changeView(item)} role="tab" type="button">{item[0]?.toUpperCase()}{item.slice(1)}</button>)}</div>{error ? <p className="error" role="alert">{error}</p> : null}<section aria-live="polite" className="project-action-grid" id="engineer-project-results" role="tabpanel" tabIndex={0}>{projects.map((project) => {
    const editable = project.editable ?? project.engineerId === currentUserId;
    const next = getEngineerNextAction(project.state);
    const action = next.kind === "uptake" && editable ? <NextActionButton busy={busyId === project.id} onClick={() => void accept(project.id)}>Accept Assignment</NextActionButton> : <NextActionButton href={`/engineer/projects/${project.id}${next.anchor ? `#${next.anchor}` : ""}`}>{editable ? next.label : "View Work"}</NextActionButton>;
    return <ProjectActionCard action={action} key={project.id} project={project}>{editable ? next.secondary.map((item) => <Link href={`/engineer/projects/${project.id}#${item.anchor}`} key={item.label}>{item.label}</Link>) : <span className="read-only-label">Read-only coordination view</span>}</ProjectActionCard>;
  })}{!loading && projects.length === 0 ? <div className="empty-state"><strong>No {view} work.</strong><span>Records move here automatically as their workflow state changes.</span></div> : null}{loading ? <p className="portal-muted portal-table-loading">Loading work…</p> : null}</section><PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></div>;
}
