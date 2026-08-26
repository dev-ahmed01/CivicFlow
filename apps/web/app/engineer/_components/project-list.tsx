"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { NextActionButton, ProjectActionCard } from "../../_components/operations";
import { PaginationControls } from "../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { getEngineerNextAction } from "../../_lib/workflow-actions";
import { apiFetch, getSession } from "../_lib/api";

type WorkView = "mine" | "assigned";

export function EngineerProjectList() {
  const [view, setView] = useState<WorkView>("mine");
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ scope: view, page: String(page), limit: "20" });
      const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query.toString()}`);
      setProjects(result.projects);
      setPagination(result.pagination);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [page, view]);
  usePortalPolling(load);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("view") === "assigned") setView("assigned");
  }, []);

  const changeView = (nextView: WorkView) => {
    setView(nextView);
    setPage(1);
    setLoading(true);
  };
  const accept = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/projects/${id}/uptake`, { method: "POST" });
      notifyPortalDataChanged();
      if (view === "assigned") { setPage(1); setView("mine"); }
      else await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept project");
    } finally {
      setBusyId(undefined);
    }
  };
  const currentUserId = getSession()?.user.id;

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Executive Engineer</p><h1>Projects</h1><p>Every project card exposes the next valid action for its current server state.</p></div></header>
    <div aria-label="Project views" className="engineer-work-tabs" role="tablist"><button aria-controls="engineer-project-results" aria-selected={view === "mine"} className={view === "mine" ? "active" : ""} onClick={() => changeView("mine")} role="tab" type="button">Active work</button><button aria-controls="engineer-project-results" aria-selected={view === "assigned"} className={view === "assigned" ? "active" : ""} onClick={() => changeView("assigned")} role="tab" type="button">Awaiting acceptance</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" className="project-action-grid" id="engineer-project-results" role="tabpanel" tabIndex={0}>{projects.map((project) => {
      const editable = project.editable ?? project.engineerId === currentUserId;
      const action = getEngineerNextAction(project.state);
      const actionNode = action.kind === "uptake" && editable
        ? <NextActionButton busy={busyId === project.id} onClick={() => void accept(project.id)}>Accept Project</NextActionButton>
        : <NextActionButton href={`/engineer/projects/${project.id}${action.anchor ? `#${action.anchor}` : ""}`}>{editable ? action.label : "View Project"}</NextActionButton>;
      return <ProjectActionCard action={actionNode} key={project.id} project={project}>{editable ? action.secondary.map((item) => <Link href={`/engineer/projects/${project.id}#${item.anchor}`} key={item.label}>{item.label}</Link>) : <span className="read-only-label">Read-only coordination view</span>}</ProjectActionCard>;
    })}{!loading && projects.length === 0 ? <div className="empty-state"><strong>{view === "mine" ? "No active projects." : "No assignments are waiting for acceptance."}</strong><span>New work will appear here automatically.</span></div> : null}{loading ? <p className="portal-muted portal-table-loading">Loading projects…</p> : null}</section>
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
