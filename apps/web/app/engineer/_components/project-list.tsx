"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { PaginationMeta, ProjectListItem } from "@civicos/shared";
import { EngineerDateStamp, EngineerLoading, EngineerSymbol, EngineerTip } from "./engineer-ui";
import { PageHeader, PaginationControls, PortalStatePill } from "../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { getEngineerNextAction } from "../../_lib/workflow-actions";
import { apiFetch, getSession } from "../_lib/api";

type WorkView = "assigned" | "scheduled" | "active" | "completed";
const views: WorkView[] = ["assigned", "scheduled", "active", "completed"];

export function EngineerProjectList() {
  const [view, setView] = useState<WorkView>(() => { const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("view"); return requested && views.includes(requested as WorkView) ? requested as WorkView : "active"; });
  const requestVersion = useRef(0);
  const [projects, setProjects] = useState<Array<ProjectListItem & { editable?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ active: 0, scheduled: 0, completed: 0, overdue: 0 });
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const query = new URLSearchParams({ scope: view === "assigned" ? "assigned" : "mine", page: String(page), limit: "20" });
      if (view !== "assigned") query.set("stage", view);
      const [result, allMine] = await Promise.all([
        apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>(`/projects?${query}`),
        apiFetch<{ projects: Array<ProjectListItem & { editable?: boolean }>; pagination: PaginationMeta }>("/projects?scope=mine&limit=50"),
      ]);
      if (version !== requestVersion.current) return;
      setProjects(result.projects); setPagination(result.pagination); setError(undefined);
      const now = Date.now();
      setSummary({
        active: allMine.projects.filter((item) => ["ACTIVE", "MODIFIED"].includes(item.state)).length,
        scheduled: allMine.projects.filter((item) => ["UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(item.state)).length,
        completed: allMine.projects.filter((item) => ["COMPLETED", "AWAITING_VERIFICATION", "CLOSED"].includes(item.state)).length,
        overdue: allMine.projects.filter((item) => !["COMPLETED", "AWAITING_VERIFICATION", "CLOSED"].includes(item.state) && item.action && new Date(item.action.deadline).getTime() < now).length,
      });
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
  const labels: Record<WorkView, string> = { active: "Active", assigned: "Assigned", scheduled: "Scheduled", completed: "Completed" };
  return <div className="field-module engineer-my-work">
    <PageHeader eyebrow="Field delivery" title="My Work" description="Move assigned work from acceptance and scheduling into explicit field execution and verified completion." action={<EngineerDateStamp />} />
    <div aria-label="My Work views" className="engineer-work-tabs" role="group">{views.map((item) => <button aria-pressed={view === item} className={view === item ? "active" : ""} key={item} onClick={() => changeView(item)} type="button">{labels[item]}</button>)}</div>
    <section className="engineer-stat-grid engineer-work-summary" aria-label="Work summary">
      <article className="engineer-stat"><span className="engineer-symbol green"><EngineerSymbol name="work" /></span><div><strong>{summary.active}</strong><span>Active work</span><small>In progress</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol amber"><EngineerSymbol name="calendar" /></span><div><strong>{summary.scheduled}</strong><span>Scheduled</span><small>Upcoming</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol blue"><EngineerSymbol name="check" /></span><div><strong>{summary.completed}</strong><span>Completed</span><small>All completed work</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol red"><EngineerSymbol name="clock" /></span><div><strong>{summary.overdue}</strong><span>Overdue</span><small>Needs attention</small></div></article>
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" aria-busy={loading} className="engineer-work-grid" id="engineer-project-results" aria-label="Work records">
      {loading ? <EngineerLoading /> : projects.map((project) => {
        const editable = project.editable ?? project.engineerId === currentUserId;
        const next = getEngineerNextAction(project.state);
        const href = "/engineer/projects/" + project.id;
        const stage = project.state === "CLOSED" ? 100 : ["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state) ? 85 : ["ACTIVE", "MODIFIED"].includes(project.state) ? 60 : ["TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(project.state) ? 35 : 15;
        return <article className="engineer-project-work-card" key={project.id}>
          <header><small>Project {project.referenceNumber.replace("CW", "").slice(0, 8)}</small><PortalStatePill state={project.state} /></header>
          <h2><Link href={href}>{project.title}</Link></h2>
          <dl><div><dt>Agency</dt><dd>{project.agency.name}</dd></div><div><dt>Responsible</dt><dd>{project.engineer?.email ?? "Awaiting assignment"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? project.locationLabel ?? "Not mapped"}</dd></div><div><dt>Dependencies</dt><dd>{project.dependencyCount ? `${project.dependencyCount} linked` : "None"}</dd></div><div><dt>Grievance</dt><dd className={project.grievance ? "danger" : ""}>{project.grievance?.status ?? "None"}</dd></div></dl>
          <div className="engineer-work-actions">{next.kind === "uptake" && editable ? <button className="engineer-action" disabled={busyId === project.id} onClick={() => void accept(project.id)} type="button">{busyId === project.id ? "Accepting..." : "Accept assignment"}</button> : <Link className="engineer-action" href={href + (editable && next.anchor ? `#${next.anchor}` : "")}>{editable ? next.label : "View work"}</Link>}{editable && ["ACTIVE", "MODIFIED"].includes(project.state) ? <><Link href={`${href}#plan`}>Update Timeline</Link><Link href={`${href}#completion`}>Mark Complete</Link></> : null}</div>
          <div className="engineer-stage"><span>Workflow stage</span><i><b style={{ width: `${stage}%` }} /></i><strong>{project.state.toLowerCase().replaceAll("_", " ")}</strong></div>
        </article>;
      })}
      {!loading && projects.length === 0 ? <p className="engineer-empty">No {labels[view].toLowerCase()} work. Records appear here as their workflow state changes.</p> : null}
    </section>
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={(next) => { setLoading(true); setPage(next); }} />
    <EngineerTip>Keep your work updates and timelines current to ensure smooth coordination with other departments.</EngineerTip>
  </div>;
}
