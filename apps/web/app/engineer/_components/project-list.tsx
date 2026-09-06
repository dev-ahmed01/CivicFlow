"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { DependencyListItem, InspectionDetail } from "@civicos/shared";
import { EngineerDateStamp, EngineerLoading, EngineerStatCard, EngineerTip } from "./engineer-ui";
import { PageHeader, PaginationControls, PortalStatePill } from "../../_components/ui";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { getEngineerNextAction } from "../../_lib/workflow-actions";
import { apiFetch, getSession } from "../_lib/api";

import { queryPage, useEngineerQuery } from "../_lib/navigation";
import { isWorkOverdue, loadWorkStage, workViews, type WorkView, type EngineerWork, type WorkBlocker } from "../_lib/work-data";
import { isDependencyOpen, isInspectionOpen } from "../_lib/presentation";

export function EngineerProjectList() {
  const { params, update } = useEngineerQuery();
  const requested = params.get("state") ?? params.get("view");
  const view = workViews.includes(requested as WorkView) || ["attention", "blocked"].includes(requested ?? "") ? requested! : "all";
  const page = queryPage(params.get("page"));
  const requestVersion = useRef(0);
  const [stages, setStages] = useState<Record<WorkView, EngineerWork[]>>({ assigned: [], scheduled: [], active: [], completed: [] });
  const [blockers, setBlockers] = useState<WorkBlocker[]>([]);
  const [inspections, setInspections] = useState<InspectionDetail[]>([]);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [assigned, scheduled, active, completed, blockerResult, inspectionResult, dependencyResult] = await Promise.all([
        loadWorkStage("assigned"), loadWorkStage("scheduled"), loadWorkStage("active"), loadWorkStage("completed"),
        apiFetch<{ blockers: WorkBlocker[] }>("/project-blockers"),
        apiFetch<{ inspections: InspectionDetail[] }>("/inspections"),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=received"),
      ] as const);
      if (version !== requestVersion.current) return;
      setStages({ assigned, scheduled, active, completed });
      setBlockers(blockerResult.blockers); setInspections(inspectionResult.inspections); setDependencies(dependencyResult.dependencies); setError(undefined);
    } catch (reason) { if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Could not load work"); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, []);
  usePortalPolling(load);
  const changeView = (next: string) => update({ state: next === view || next === "all" ? undefined : next, view: undefined, page: undefined });
  const all = workViews.flatMap((stage) => stages[stage]);
  const blockedIds = new Set(blockers.map((blocker) => blocker.project.id));
  const visible = workViews.includes(view as WorkView) ? stages[view as WorkView] : view === "blocked" ? all.filter((work) => blockedIds.has(work.id)) : view === "attention" ? all.filter((work) => work.state === "PENDING_UPTAKE" || isWorkOverdue(work)) : all;
  const totalPages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, totalPages);
  const projects = visible.slice((currentPage - 1) * 20, currentPage * 20);
  const overdue = all.filter((work) => isWorkOverdue(work)).length;
  const attentionInspections = inspections.filter((item) => isInspectionOpen(item) && (item.status === "ASSIGNED" || new Date(item.deadline).getTime() < Date.now()));
  const attentionDependencies = dependencies.filter((item) => item.assignedEngineer?.id === getSession()?.user.id && isDependencyOpen(item));
  const accept = async (id: string) => {
    setBusyId(id);
    try { await apiFetch(`/projects/${id}/uptake`, { method: "POST" }); await load(); notifyPortalDataChanged(); update({ state: "scheduled", view: undefined, page: undefined }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not accept assignment"); }
    finally { setBusyId(undefined); }
  };
  const currentUserId = getSession()?.user.id;
  const labels: Record<string, string> = { all: "All", attention: "Needs attention", blocked: "Blocked", active: "Active", assigned: "Assigned", scheduled: "Scheduled", completed: "Completed" };
  return <div className="field-module engineer-my-work">
    <PageHeader eyebrow="Field delivery" title="My Work" description="Move assigned work from acceptance and scheduling into explicit field execution and verified completion." action={<EngineerDateStamp />} />
    <section className="engineer-stat-grid engineer-work-summary" aria-label="Work lifecycle">
      {workViews.map((item, index) => <EngineerStatCard key={item} label={labels[item]!} count={loading ? undefined : stages[item].length} note={["Waiting for acceptance", "Upcoming work", "In progress", "Finished work"][index]!} icon={["work", "calendar", "clock", "check"][index]!} tone={["amber", "blue", "green", "green"][index]!} selected={view === item} onClick={() => changeView(item)} />)}
    </section>
    <div className="engineer-list-heading"><h2>{view === "all" ? "Work registry" : labels[view]}</h2>{overdue > 0 ? <span className="engineer-overdue">{overdue} overdue</span> : null}{view !== "all" ? <button className="engineer-text-button" onClick={() => changeView("all")} type="button">Show all work</button> : null}</div>
    {view === "attention" && !loading ? <div className="engineer-attention-collection">{attentionInspections.map((item) => <Link key={item.id} href={`/engineer/inspections/${item.id}`}><span>Inspection ? {item.ticket.title}</span><span>{item.status === "ASSIGNED" ? "Review assignment" : "Continue inspection"} ?</span></Link>)}{attentionDependencies.map((item) => <Link key={item.id} href={`/engineer/dependencies#dependency-${item.id}`}><span>Dependency ? {item.requirement}</span><span>View dependency ?</span></Link>)}</div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" aria-busy={loading} className="engineer-work-grid" id="engineer-project-results" aria-label="Work records">
      {loading ? <EngineerLoading /> : projects.map((project) => {
        const editable = project.editable ?? project.engineerId === currentUserId;
        const next = getEngineerNextAction(project.state);
        const href = "/engineer/projects/" + project.id;
        const stage = project.state === "CLOSED" ? 100 : ["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state) ? 85 : ["ACTIVE", "MODIFIED"].includes(project.state) ? 60 : ["TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(project.state) ? 35 : 15;
        return <article className="engineer-project-work-card" key={project.id}>
          <header><small>Project {project.referenceNumber.replace("CW", "").slice(0, 8)}</small><PortalStatePill state={project.state} /></header>
          {isWorkOverdue(project) ? <span className="engineer-overdue">Overdue action</span> : null}
          <h2><Link href={href}>{project.title}</Link></h2>
          <dl><div><dt>Agency</dt><dd>{project.agency.name}</dd></div><div><dt>Responsible</dt><dd>{project.engineer?.email ?? "Awaiting assignment"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? project.locationLabel ?? "Not mapped"}</dd></div><div><dt>Dependencies</dt><dd>{project.dependencyCount ? `${project.dependencyCount} linked` : "None"}</dd></div><div><dt>Grievance</dt><dd className={project.grievance ? "danger" : ""}>{project.grievance?.status ?? "None"}</dd></div></dl>
          <div className="engineer-work-actions">{next.kind === "uptake" && editable ? <button className="engineer-action" disabled={busyId === project.id} onClick={() => void accept(project.id)} type="button">{busyId === project.id ? "Accepting..." : "Accept assignment"}</button> : <Link className="engineer-action" href={href + (editable && next.anchor ? `#${next.anchor}` : "")}>{editable ? next.label : "View work"}</Link>}{editable && ["ACTIVE", "MODIFIED"].includes(project.state) ? <><Link href={`${href}#plan`}>Update Timeline</Link><Link href={`${href}#completion`}>Mark Complete</Link></> : null}</div>
          <div className="engineer-stage"><span>Workflow stage</span><i><b style={{ width: `${stage}%` }} /></i><strong>{project.state.toLowerCase().replaceAll("_", " ")}</strong></div>
        </article>;
      })}
      {!loading && projects.length === 0 ? <p className="engineer-empty">No {labels[view]!.toLowerCase()} work. Records appear here as their workflow state changes.</p> : null}
    </section>
    <PaginationControls page={currentPage} totalPages={totalPages} onPageChange={(next) => update({ page: String(next) })} />
    <EngineerTip>Keep your work updates and timelines current to ensure smooth coordination with other departments.</EngineerTip>
  </div>;
}
