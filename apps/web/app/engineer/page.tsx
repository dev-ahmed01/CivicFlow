"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DependencyListItem, InspectionDetail, PaginationMeta, ProjectListItem } from "@civicos/shared";
import { usePortalPolling } from "../_lib/portal-refresh";
import { EngineerHeader, EngineerLoading, EngineerQueue, EngineerTip, engineerDate } from "./_components/engineer-ui";
import { PortalStatePill } from "../_components/ui";
import { isDependencyOpen, isInspectionOpen, inspectionAction } from "./_lib/presentation";
import { apiFetch, getSession } from "./_lib/api";

type Blocker = { id: string; title: string; severity: string; project: { id: string; title: string; referenceNumber: string } };

export default function EngineerTodayPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [assigned, setAssigned] = useState<ProjectListItem[]>([]);
  const [inspections, setInspections] = useState<InspectionDetail[]>([]);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [mine, waiting, inspectionResult, dependencyResult, blockerResult] = await Promise.all([
        apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>("/projects?scope=mine&limit=50"),
        apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>("/projects?scope=assigned&limit=50"),
        apiFetch<{ inspections: InspectionDetail[] }>("/inspections"),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=received"),
        apiFetch<{ blockers: Blocker[] }>("/project-blockers"),
      ]);
      setProjects(mine.projects); setAssigned(waiting.projects); setInspections(inspectionResult.inspections); setDependencies(dependencyResult.dependencies); setBlockers(blockerResult.blockers); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load today’s field plan"); }
    finally { setLoading(false); }
  }, []);
  usePortalPolling(load);
  const userId = getSession()?.user.id;
  const assignedDependencies = dependencies.filter((item) => item.assignedEngineer?.id === userId && isDependencyOpen(item));
  const openInspections = inspections.filter(isInspectionOpen).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const activeProjects = projects.filter((item) => ["ACTIVE", "MODIFIED"].includes(item.state));
  const upcoming = projects.filter((item) => ["UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(item.state)).sort((a, b) => new Date(a.plannedStart ?? a.createdAt).getTime() - new Date(b.plannedStart ?? b.createdAt).getTime());
  const overdueInspections = openInspections.filter((item) => new Date(item.deadline).getTime() < Date.now());
  const needsAction = openInspections.length + assigned.length + assignedDependencies.length + blockers.length;

  return <div className="field-module engineer-today">
    <EngineerHeader eyebrow="Engineer operations" title="Today" description="Your assigned inspections, active work and dependencies that need attention." count={loading ? undefined : needsAction} countLabel="actionable tasks" />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <EngineerLoading label="Loading your field plan" /> : <>
      <section className="engineer-attention engineer-today-attention">
        <p className="eyebrow">Needs your attention</p>
        {overdueInspections.length > 0 ? <div><span className="engineer-attention-dot" aria-hidden="true">!</span><div><strong>{overdueInspections.length} overdue inspection{overdueInspections.length === 1 ? "" : "s"}</strong><p>{overdueInspections[0]!.ticket.title}</p><span>Due {engineerDate(overdueInspections[0]!.deadline)}</span></div><Link className="engineer-action" href={"/engineer/inspections/" + overdueInspections[0]!.id}>Inspect <span aria-hidden="true">&rarr;</span></Link></div> : null}
        <ul className="engineer-attention-links">
          <li><Link href="/engineer/inspections"><span>Inspections awaiting acceptance</span><strong>{inspections.filter(({ status }) => status === "ASSIGNED").length}</strong><span aria-hidden="true">&rsaquo;</span></Link></li>
          <li><Link href="/engineer/projects?view=assigned"><span>Work assignments to review</span><strong>{assigned.length}</strong><span aria-hidden="true">&rsaquo;</span></Link></li>
          <li><Link href="/engineer/dependencies"><span>Assigned dependency tasks</span><strong>{assignedDependencies.length}</strong><span aria-hidden="true">&rsaquo;</span></Link></li>
        </ul>
        {blockers.map((blocker) => <div className="engineer-blocker-row" key={blocker.id}><span className="engineer-attention-dot" aria-hidden="true">!</span><div><strong>{blocker.title}</strong><p>{blocker.project.referenceNumber} &middot; {blocker.project.title}</p><span>{blocker.severity.toLowerCase()} severity</span></div><Link className="engineer-action secondary" href={"/engineer/projects/" + blocker.project.id}>Open work &rarr;</Link></div>)}
      </section>
      <EngineerQueue title="Inspections due" count={openInspections.length} href="/engineer/inspections">
        {openInspections.slice(0, 5).map((item) => <article className="engineer-queue-row" key={item.id}><PortalStatePill state={new Date(item.deadline).getTime() < Date.now() ? "OVERDUE" : item.status} /><div><h3>{item.ticket.title}</h3><p>{item.ticket.referenceNumber} &middot; {item.ticket.address}</p></div><div className="engineer-row-meta"><small>Due</small><span>{engineerDate(item.deadline)}</span></div><Link className="engineer-action secondary" href={"/engineer/inspections/" + item.id}>{inspectionAction(item.status)} <span aria-hidden="true">&rsaquo;</span></Link></article>)}
        {openInspections.length === 0 ? <p className="engineer-empty">No inspections need a field response.</p> : null}
      </EngineerQueue>
      <EngineerQueue title="Active work" count={activeProjects.length} href="/engineer/projects?view=active">
        {activeProjects.slice(0, 5).map((item) => <article className="engineer-queue-row" key={item.id}><PortalStatePill state={item.state} /><div><h3>{item.title}</h3><p>{item.referenceNumber} &middot; {item.locationLabel ?? item.ticket?.ward.name ?? "Mapped work"}</p></div><div className="engineer-row-meta"><small>Planned end</small><span>{engineerDate(item.plannedEnd)}</span></div><Link className="engineer-action secondary" href={"/engineer/projects/" + item.id}>{item.state === "ACTIVE" ? "Update progress" : "Open work"} <span aria-hidden="true">&rsaquo;</span></Link></article>)}
        {activeProjects.length === 0 ? <p className="engineer-empty">No work is currently in field execution.</p> : null}
      </EngineerQueue>
      <EngineerQueue title="Dependencies" count={assignedDependencies.length} href="/engineer/dependencies">
        {assignedDependencies.slice(0, 4).map((item) => <article className="engineer-queue-row" key={item.id}><PortalStatePill state={item.state} /><div><h3>{item.project.ticket?.title ?? "Agency coordination"}</h3><p>{item.requestingAgency.name} &harr; {item.respondingAgency.name}</p></div><div className="engineer-row-meta"><small>Deadline</small><span>{engineerDate(item.deadline)}</span></div><Link className="engineer-action secondary" href={"/engineer/dependencies#dependency-" + item.id}>Review now <span aria-hidden="true">&rsaquo;</span></Link></article>)}
        {assignedDependencies.length === 0 ? <p className="engineer-empty">No dependency tasks are assigned to you.</p> : null}
      </EngineerQueue>
      <EngineerQueue title="Upcoming" count={upcoming.length} href="/engineer/projects?view=scheduled">
        {upcoming.slice(0, 5).map((item) => <article className="engineer-queue-row" key={item.id}><PortalStatePill state={item.state} /><div><h3>{item.title}</h3><p>{item.referenceNumber} &middot; {item.locationLabel ?? "Location pending"}</p></div><div className="engineer-row-meta"><small>Planned start</small><span>{engineerDate(item.plannedStart)}</span></div><Link className="engineer-action secondary" href={"/engineer/projects/" + item.id}>Open work <span aria-hidden="true">&rsaquo;</span></Link></article>)}
        {upcoming.length === 0 ? <p className="engineer-empty">No upcoming work is scheduled.</p> : null}
      </EngineerQueue>
      <EngineerTip>Review due inspections and coordination requests before starting field work.</EngineerTip>
    </>}
  </div>;
}
