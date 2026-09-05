"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DependencyListItem, InspectionDetail, PaginationMeta, ProjectListItem } from "@civicos/shared";
import { PageHeader, PortalStatePill } from "../_components/ui";
import { usePortalPolling } from "../_lib/portal-refresh";
import { EngineerDateStamp, EngineerLoading, EngineerSymbol, EngineerTip, engineerDate } from "./_components/engineer-ui";
import { isDependencyOpen, isInspectionOpen } from "./_lib/presentation";
import { apiFetch, getSession } from "./_lib/api";

type Blocker = { id: string; title: string; severity: string; project: { id: string; title: string; referenceNumber: string } };
type PlanItem = { id: string; title: string; location: string; status: string; at: string | Date; href: string };
type AssignmentItem = { id: string; title: string; status: string; due: string | Date; href: string };

function timeLabel(value: string | Date) {
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function dateTile(value: string | Date) {
  const date = new Date(value);
  return { day: date.toLocaleDateString("en-IN", { day: "2-digit" }), month: date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase() };
}

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
      setProjects(mine.projects);
      setAssigned(waiting.projects);
      setInspections(inspectionResult.inspections);
      setDependencies(dependencyResult.dependencies);
      setBlockers(blockerResult.blockers);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load today's field plan");
    } finally {
      setLoading(false);
    }
  }, []);
  usePortalPolling(load);

  const userId = getSession()?.user.id;
  const assignedDependencies = dependencies.filter((item) => item.assignedEngineer?.id === userId && isDependencyOpen(item));
  const openInspections = inspections.filter(isInspectionOpen).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const activeProjects = projects.filter((item) => ["ACTIVE", "MODIFIED"].includes(item.state));
  const scheduledProjects = projects.filter((item) => ["UPTAKEN", "TIMELINE_SET", "CONFLICT_CHECKED", "READY_TO_START"].includes(item.state));
  const needsAttention = assigned.length + openInspections.filter((item) => new Date(item.deadline).getTime() < Date.now()).length + assignedDependencies.length;
  const planItems: PlanItem[] = [
    ...activeProjects.map((item) => ({ id: item.id, title: item.title, location: item.locationLabel ?? item.ticket?.ward.name ?? "Location pending", status: "ACTIVE", at: item.actualStart ?? item.plannedStart ?? item.createdAt, href: `/engineer/projects/${item.id}` })),
    ...scheduledProjects.map((item) => ({ id: item.id, title: item.title, location: item.locationLabel ?? item.ticket?.ward.name ?? "Location pending", status: "SCHEDULED", at: item.plannedStart ?? item.createdAt, href: `/engineer/projects/${item.id}` })),
    ...openInspections.map((item) => ({ id: item.id, title: item.ticket.title, location: item.ticket.address, status: item.status === "IN_PROGRESS" ? "ACTIVE" : "UPCOMING", at: item.deadline, href: `/engineer/inspections/${item.id}` })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, 3);
  const assignments: AssignmentItem[] = [
    ...assigned.map((item) => ({ id: item.id, title: item.title, status: "PENDING ACCEPTANCE", due: item.action?.deadline ?? item.plannedStart ?? item.createdAt, href: `/engineer/projects/${item.id}` })),
    ...openInspections.map((item) => ({ id: item.id, title: item.ticket.title, status: item.status === "ASSIGNED" ? "PENDING ACCEPTANCE" : "SCHEDULED", due: item.deadline, href: `/engineer/inspections/${item.id}` })),
  ].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()).slice(0, 2);
  const attentionProject = assigned[0];
  const attentionInspection = openInspections[0];

  return <div className="field-module engineer-today">
    <PageHeader eyebrow="Field operations" title="Today" description={"Good morning, Executive Engineer\nHere's what's happening in your area today."} action={<EngineerDateStamp />} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <EngineerLoading label="Loading your field plan" /> : <>
      <section className="engineer-stat-grid" aria-label="Today summary">
        <article className="engineer-stat"><span className="engineer-symbol green"><EngineerSymbol name="work" /></span><div><strong>{activeProjects.length}</strong><span>Active works</span><small>In progress</small></div></article>
        <article className="engineer-stat"><span className="engineer-symbol amber"><EngineerSymbol name="attention" /></span><div><strong>{needsAttention}</strong><span>Needs attention</span><small>Awaiting your response</small></div></article>
        <article className="engineer-stat"><span className="engineer-symbol blue"><EngineerSymbol name="people" /></span><div><strong>{assignedDependencies.length}</strong><span>Dependencies</span><small>Waiting on others</small></div></article>
        <article className="engineer-stat"><span className="engineer-symbol red"><EngineerSymbol name="blocked" /></span><div><strong>{blockers.length}</strong><span>Blocked</span><small>{blockers.length ? "Needs attention" : "No blockers"}</small></div></article>
      </section>

      {(attentionProject || attentionInspection || blockers[0]) ? <section className="engineer-today-alert">
        <span className="engineer-symbol green"><EngineerSymbol name="bell" /></span>
        <div><p className="eyebrow">Needs your attention</p>{attentionProject ? <><strong>{assigned.length} assignment{assigned.length === 1 ? " is" : "s are"} awaiting your acceptance</strong><span>{attentionProject.title}</span><small>Assigned by {attentionProject.agency.name}</small></> : attentionInspection ? <><strong>{openInspections.length} inspection{openInspections.length === 1 ? " needs" : "s need"} your response</strong><span>{attentionInspection.ticket.title}</span><small>Due {engineerDate(attentionInspection.deadline)}</small></> : <><strong>{blockers.length} work blocker{blockers.length === 1 ? " needs" : "s need"} attention</strong><span>{blockers[0]!.title}</span><small>{blockers[0]!.project.title}</small></>}</div>
        <Link className="engineer-action" href={attentionProject ? "/engineer/projects?view=assigned" : attentionInspection ? `/engineer/inspections/${attentionInspection.id}` : `/engineer/projects/${blockers[0]!.project.id}`}>Review now <span aria-hidden="true">&rarr;</span></Link>
      </section> : null}

      <div className="engineer-today-workspace">
        <section className="engineer-day-plan"><h2>Today's field plan</h2>{planItems.length ? <div className="engineer-timeline">{planItems.map((item, index) => <article key={`${item.status}-${item.id}`}><time>{timeLabel(item.at)}</time><span className={`engineer-timeline-dot tone-${item.status.toLowerCase()}`} aria-hidden="true" /><div><PortalStatePill state={item.status} /><h3>{item.title}</h3><p><EngineerSymbol name="location" />{item.location}</p></div><Link href={item.href}>Open <span aria-hidden="true">&rarr;</span></Link>{index < planItems.length - 1 ? <i aria-hidden="true" /> : null}</article>)}</div> : <p className="engineer-empty">No field work is planned yet.</p>}<Link className="engineer-panel-link" href="/engineer/projects">View full schedule <span aria-hidden="true">&rarr;</span></Link></section>
        <section className="engineer-upcoming"><h2>Upcoming assignments</h2>{assignments.length ? assignments.map((item) => { const tile = dateTile(item.due); return <Link className="engineer-assignment" href={item.href} key={`${item.status}-${item.id}`}><time><strong>{tile.day}</strong><span>{tile.month}</span></time><span><strong>{item.title}</strong><PortalStatePill state={item.status} /><small>Due by {timeLabel(item.due)}</small></span><b aria-hidden="true">&rarr;</b></Link>; }) : <p className="engineer-empty">No upcoming assignments.</p>}<Link className="engineer-panel-link" href="/engineer/projects?view=assigned">View all assignments <span aria-hidden="true">&rarr;</span></Link></section>
      </div>
      <EngineerTip>Keep your field updates timely for better coordination.<br />All updates are visible to concerned departments.</EngineerTip>
    </>}
  </div>;
}
