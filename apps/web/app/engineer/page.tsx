"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { DependencyListItem, InspectionDetail, PaginationMeta, ProjectListItem } from "@civicos/shared";
import { usePortalPolling } from "../_lib/portal-refresh";
import { apiFetch, getSession } from "./_lib/api";

type Blocker = { id: string; title: string; severity: string; project: { id: string; title: string; referenceNumber: string } };
function time(value: string | Date | null): string { return value ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Today"; }

export default function EngineerTodayPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [assigned, setAssigned] = useState<ProjectListItem[]>([]);
  const [inspections, setInspections] = useState<InspectionDetail[]>([]);
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
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
  }, []);
  usePortalPolling(load);
  const userId = getSession()?.user.id;
  const assignedDependencies = dependencies.filter((item) => item.assignedEngineer?.id === userId && !["FULFILLED", "DECLINED"].includes(item.state));
  const today = new Date().toDateString();
  const todayProjects = projects.filter((item) => item.state === "ACTIVE" || (item.plannedStart && new Date(item.plannedStart).toDateString() === today));
  const todayInspections = inspections.filter((item) => new Date(item.deadline).toDateString() === today && !["SUBMITTED", "REVIEWED"].includes(item.status));
  const upcoming = useMemo(() => [...projects.filter((item) => item.plannedStart && new Date(item.plannedStart) > new Date()), ...assigned].sort((a, b) => new Date(a.plannedStart ?? a.createdAt).getTime() - new Date(b.plannedStart ?? b.createdAt).getTime()).slice(0, 6), [assigned, projects]);
  const needsAction = inspections.filter((item) => item.status === "ASSIGNED").length + assigned.length + assignedDependencies.length + blockers.length;

  return <div className="field-module engineer-today"><header className="portal-heading"><div><p className="eyebrow">Field operations</p><h1>Today</h1><p>What do I need to do today?</p></div><span className="today-date">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span></header>{error ? <p className="error" role="alert">{error}</p> : null}
    <section className="today-needs-action"><header><p className="eyebrow">Needs action</p><h2>{needsAction} item{needsAction === 1 ? "" : "s"} need a response</h2></header><div className="today-action-grid"><Link href="/engineer/inspections"><strong>{inspections.filter(({ status }) => status === "ASSIGNED").length}</strong><span>Inspections awaiting acceptance</span></Link><Link href="/engineer/projects?view=assigned"><strong>{assigned.length}</strong><span>Assignments awaiting acceptance</span></Link><Link href="/engineer/dependencies"><strong>{assignedDependencies.length}</strong><span>Dependency tasks</span></Link><Link href="/engineer/projects"><strong>{blockers.length}</strong><span>Open blockers</span></Link></div></section>
    <section className="today-schedule"><header><p className="eyebrow">Today’s work</p><h2>Field sequence</h2></header><ol>{todayInspections.map((item) => <li key={item.id}><time>{time(item.deadline)}</time><span className="today-marker" /><div><small>Site Inspection · {item.status.replaceAll("_", " ")}</small><strong>{item.ticket.title}</strong><span>{item.ticket.address}</span></div><Link href={`/engineer/inspections/${item.id}`}>Open →</Link></li>)}{todayProjects.map((item) => <li key={item.id}><time>{time(item.plannedStart)}</time><span className="today-marker" /><div><small>{item.state === "ACTIVE" ? "Active Work" : "Scheduled Work"}</small><strong>{item.title}</strong><span>{item.locationLabel ?? item.ticket?.ward.name ?? "Mapped work"}</span></div><Link href={`/engineer/projects/${item.id}`}>Open →</Link></li>)}{todayInspections.length + todayProjects.length === 0 ? <li className="today-empty"><div><strong>No timed field work today.</strong><span>Use Needs Action to prepare upcoming assignments.</span></div></li> : null}</ol></section>
    <section className="today-upcoming"><header><p className="eyebrow">Upcoming</p><h2>Next assignments and deadlines</h2></header>{upcoming.map((item) => <Link href={`/engineer/projects/${item.id}`} key={item.id}><time>{item.plannedStart ? new Date(item.plannedStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Accept"}</time><span><strong>{item.title}</strong><small>{item.state.replaceAll("_", " ")} · {item.locationLabel ?? item.ticket?.ward.name ?? "Location pending"}</small></span><b>→</b></Link>)}</section>
  </div>;
}
