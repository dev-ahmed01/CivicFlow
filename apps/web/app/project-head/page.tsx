"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { PaginationMeta, ProjectHeadDashboardCounts, ProjectListItem } from "@civicos/shared";
import { EmptyState, PageHeader } from "../_components/ui";
import { usePortalPolling } from "../_lib/portal-refresh";
import { WorkStatus } from "./_components/work-ui";
import { apiFetch } from "./_lib/api";

type DashboardResponse = {
  agency: { id: string; name: string };
  counts: ProjectHeadDashboardCounts;
  performance: { roadConflicts: number };
};

type AttentionRow = { label: string; count: number; context: string; href: string; action: string; priority: number };

function dueText(project: ProjectListItem): string {
  if (!project.plannedEnd) return "Schedule pending";
  const date = new Date(project.plannedEnd);
  const overdue = date.getTime() < Date.now() && !["CLOSED", "CANCELLED"].includes(project.state);
  return `${overdue ? "Overdue" : "Due"} ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function projectAction(project: ProjectListItem): { label: string; href: string } {
  if (project.grievance) return { label: "Review issue", href: `/project-head/grievances?grievance=${project.grievance.id}` };
  if (project.state === "CREATED" && project.ticketId) return { label: "Assign engineer", href: `/project-head/projects?ticketId=${project.ticketId}` };
  if (["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state)) return { label: "Review completion", href: `/project-head/projects/${project.id}` };
  return { label: "Open work", href: `/project-head/projects/${project.id}` };
}

export default function ProjectHeadTodayPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [activeWork, setActiveWork] = useState<ProjectListItem[]>([]);
  const [workflowCounts, setWorkflowCounts] = useState({ readyToCreate: 0, readyToAssign: 0, awaitingVerification: 0 });
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [dashboard, readyToCreate, readyToAssign, awaitingVerification, projects] = await Promise.all([
        apiFetch<DashboardResponse>("/project-head/dashboard"),
        apiFetch<{ pagination: PaginationMeta }>("/tickets?status=INSPECTION_COMPLETE&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=CREATED&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=AWAITING_VERIFICATION&limit=1"),
        apiFetch<{ projects: ProjectListItem[] }>("/projects?limit=30"),
      ]);
      const operational = projects.projects
        .filter((project) => !["CLOSED", "CANCELLED"].includes(project.state))
        .sort((left, right) => {
          const leftUrgent = left.grievance || left.action && new Date(left.action.deadline).getTime() < Date.now() ? 1 : 0;
          const rightUrgent = right.grievance || right.action && new Date(right.action.deadline).getTime() < Date.now() ? 1 : 0;
          return rightUrgent - leftUrgent || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        })
        .slice(0, 6);
      setData(dashboard);
      setActiveWork(operational);
      setWorkflowCounts({ readyToCreate: readyToCreate.pagination.total, readyToAssign: readyToAssign.pagination.total, awaitingVerification: awaitingVerification.pagination.total });
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load today’s operations");
    }
  }, []);
  usePortalPolling(load);

  const attention = useMemo<AttentionRow[]>(() => data ? [
    { label: "Inspections due", count: data.counts.newValidatedTickets + data.counts.inspectionsDue, context: "Validated issues waiting for a site decision", href: "/project-head/projects?view=INTAKE", action: "Review inspections", priority: 1 },
    { label: "Works ready for assignment", count: workflowCounts.readyToCreate + workflowCounts.readyToAssign, context: "Inspected work ready to set up or assign", href: "/project-head/projects?view=READY", action: "Assign engineers", priority: 2 },
    { label: "Agency responses waiting", count: data.counts.dependencyRequestsPending, context: "Formal coordination requests requiring action", href: "/project-head/dependencies", action: "Open coordination", priority: 3 },
    { label: "Road conflict rules triggered", count: data.performance.roadConflicts, context: "Advisory rule alerts grouped into coordination issues", href: "/project-head/dependencies?view=CONFLICTS", action: "Review conflicts", priority: 4 },
    { label: "Deadlines approaching or overdue", count: data.counts.attentionActions, context: "Open workflow actions with a response deadline", href: "/project-head/notifications", action: "Review deadlines", priority: 5 },
    { label: "Citizen issues requiring review", count: data.counts.openGrievances, context: "Grievances linked to existing work records", href: "/project-head/grievances", action: "Review issues", priority: 6 },
    { label: "Work awaiting closure", count: workflowCounts.awaitingVerification, context: "Completed work waiting for verification or closure", href: "/project-head/projects?view=CLOSURE", action: "Review completion", priority: 7 },
  ].filter((item) => item.count > 0).sort((left, right) => left.priority - right.priority) : [], [data, workflowCounts]);

  return <div className="ph-today-page">
    <PageHeader title="Today" description={data ? `${data.agency.name} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}` : "Your agency operations desk"} action={<Link className="portal-primary-button" href="/project-head/tickets/new">+ New ticket</Link>} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="portal-muted" role="status">Loading today’s operations…</p> : null}
    {data ? <>
      <section className="ph-attention-list" aria-labelledby="attention-title">
        <header><div><h2 id="attention-title">Needs your attention</h2><p>Decisions and responses ordered by operational priority.</p></div><span>{attention.reduce((total, item) => total + item.count, 0)} open</span></header>
        {attention.length ? <ol>{attention.map((item) => <li key={item.label}><div><strong>{item.label}</strong><span>{item.context}</span></div><b>{item.count}</b><Link href={item.href}>{item.action} →</Link></li>)}</ol> : <EmptyState title="No immediate actions" description="New inspections, coordination requests, and closure checks will appear here." />}
      </section>

      <section className="ph-active-work" aria-labelledby="active-work-title">
        <header><div><h2 id="active-work-title">Active work</h2><p>Recent civic work with the clearest next operational action.</p></div><Link href="/project-head/projects">View all work →</Link></header>
        {activeWork.length ? <ol>{activeWork.map((project) => {
          const action = projectAction(project);
          return <li key={project.id}><div className="ph-work-identity"><strong>{project.ticket?.title ?? project.title}</strong><span>{project.locationLabel ?? project.ticket?.ward.name ?? "Location pending"} · {project.agency.name}</span></div><WorkStatus state={project.state} /><span className="ph-work-owner">{project.engineer?.email ?? "Unassigned"}<small>{dueText(project)}</small></span><Link className="ph-row-action" href={action.href}>{action.label} →</Link></li>;
        })}</ol> : <EmptyState title="No active work" description="Created and assigned civic work will appear here." />}
      </section>

      <p className="ph-summary-strip">{data.counts.attentionActions} deadlines · {data.performance.roadConflicts} road rule alerts · {data.counts.activeProjects} active works</p>
    </> : null}
  </div>;
}
