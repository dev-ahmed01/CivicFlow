"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { EngineerHeader, EngineerLoading, EngineerTip, engineerDate } from "./engineer-ui";
import { PaginationControls, PortalStatePill } from "../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { getEngineerNextAction } from "../../_lib/workflow-actions";
import { apiFetch, getSession } from "../_lib/api";

type WorkView = "assigned" | "scheduled" | "active" | "review" | "completed";
const views: WorkView[] = ["active", "assigned", "scheduled", "review", "completed"];

export function EngineerProjectList() {
  const [view, setView] = useState<WorkView>(() => { const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("view"); return requested && views.includes(requested as WorkView) ? requested as WorkView : "active"; });
  const requestVersion = useRef(0);
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const query = new URLSearchParams({ scope: view === "assigned" ? "assigned" : "mine", page: String(page), limit: "20" });
      if (view === "review") query.set("status", "AWAITING_VERIFICATION");
      else if (view !== "assigned") query.set("stage", view);
      const result = await apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query}`);
      if (version !== requestVersion.current) return;
      setProjects(result.projects); setPagination(result.pagination); setError(undefined);
    } catch (reason) { if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Could not load work"); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [page, view]);
  usePortalPolling(load);
  const changeView = (next: WorkView) => { if (next === view) return; setView(next); setPage(1); setLoading(true); setProjects([]); };
  const accept = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); notifyPortalDataChanged(); setLoading(true); setProjects([]); setView("scheduled"); setPage(1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept assignment"); }
    finally { setBusyId(undefined); }
  };
  const currentUserId = getSession()?.user.id;
  const labels: Record<WorkView, string> = { active: "Active", assigned: "Assigned", scheduled: "Upcoming", review: "Awaiting review", completed: "Completed" };
  return <div className="field-module engineer-my-work">
    <EngineerHeader eyebrow="Field delivery" title="My Work" description="Track your assigned civic work from acceptance through completion." count={loading ? undefined : pagination.total} countLabel={labels[view].toLowerCase()} />
    <div aria-label="My Work views" className="engineer-work-tabs" role="group">{views.map((item) => <button aria-pressed={view === item} className={view === item ? "active" : ""} key={item} onClick={() => changeView(item)} type="button">{labels[item]}</button>)}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" aria-busy={loading} className="engineer-register" id="engineer-project-results" aria-label="Work records">
      <header className="engineer-register-title"><h2>{labels[view]} work</h2><span>{pagination.total} records</span></header>
      {loading ? <EngineerLoading /> : projects.map((project) => {
        const editable = project.editable ?? project.engineerId === currentUserId;
        const next = getEngineerNextAction(project.state);
        const href = "/engineer/projects/" + project.id;
        return <article className="engineer-work-record" key={project.id}>
          <div className="engineer-record-state"><PortalStatePill state={project.state} />{project.grievance ? <small className="engineer-overdue">Grievance: {project.grievance.status.toLowerCase().replaceAll("_", " ")}</small> : null}</div>
          <div className="engineer-record-main"><small className="engineer-reference">{project.referenceNumber}</small><h2><Link href={href}>{project.title}</Link></h2><p>{project.locationLabel ?? project.ticket?.ward.name ?? "Location pending"} &middot; {project.agency.name}</p><details className="engineer-row-disclosure"><summary>Work details</summary><dl><div><dt>Assigned engineer</dt><dd>{project.engineer?.email ?? "Awaiting assignment"}</dd></div><div><dt>Response deadline</dt><dd>{project.action ? engineerDate(project.action.deadline) : "No pending response"}</dd></div></dl>{editable ? <div className="engineer-record-links">{next.secondary.map((item) => <Link href={href + "#" + item.anchor} key={item.label}>{item.label}</Link>)}</div> : <p>Read-only coordination view</p>}</details></div>
          <div className="engineer-row-meta"><small>Planned dates</small><span>{engineerDate(project.plannedStart)}</span><span>{engineerDate(project.plannedEnd)}</span></div>
          <div className="engineer-row-meta"><small>Dependencies</small><span>{project.dependencyCount ? project.dependencyCount + " connected" : "None"}</span>{project.conflictCount + project.roadConflictCount > 0 ? <small className="engineer-warning">{project.conflictCount + project.roadConflictCount} advisory warnings</small> : null}</div>
          {next.kind === "uptake" && editable ? <button className="engineer-action" disabled={busyId === project.id} onClick={() => void accept(project.id)} type="button">{busyId === project.id ? "Accepting..." : "Accept assignment"}</button> : <Link className="engineer-action secondary" href={href + (editable && next.anchor ? "#" + next.anchor : "")}>{editable ? next.label : "View work"} <span aria-hidden="true">&rsaquo;</span></Link>}
        </article>;
      })}
      {!loading && projects.length === 0 ? <p className="engineer-empty">No {labels[view].toLowerCase()} work. Records appear here as their workflow state changes.</p> : null}
    </section>
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={(next) => { setLoading(true); setPage(next); }} />
    <EngineerTip>Open a work record to update its timeline, report a blocker, or submit completion evidence.</EngineerTip>
  </div>;
}
