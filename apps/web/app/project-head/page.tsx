"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { PaginationMeta, ProjectHeadDashboardCounts, ProjectListItem } from "@civicos/shared";
import { EmptyState, PageHeader, PortalStatePill, relativeDate } from "../_components/ui";
import { usePortalPolling } from "../_lib/portal-refresh";
import { apiFetch } from "./_lib/api";

type DashboardResponse = {
  agency: { id: string; name: string };
  counts: ProjectHeadDashboardCounts;
  performance: { roadConflicts: number };
};

type AttentionRow = { label: string; count: number; context: string; href: string; priority: number };

export default function ProjectHeadDashboardPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [recent, setRecent] = useState<ProjectListItem[]>([]);
  const [workflowCounts, setWorkflowCounts] = useState({ readyToCreate: 0, readyToAssign: 0, awaitingVerification: 0 });
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [dashboard, readyToCreate, readyToAssign, awaitingVerification, projects] = await Promise.all([
        apiFetch<DashboardResponse>("/project-head/dashboard"),
        apiFetch<{ pagination: PaginationMeta }>("/tickets?status=INSPECTION_COMPLETE&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=CREATED&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=AWAITING_VERIFICATION&limit=1"),
        apiFetch<{ projects: ProjectListItem[] }>("/projects?limit=6"),
      ]);
      setData(dashboard);
      setRecent([...projects.projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 5));
      setWorkflowCounts({ readyToCreate: readyToCreate.pagination.total, readyToAssign: readyToAssign.pagination.total, awaitingVerification: awaitingVerification.pagination.total });
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the operations overview");
    }
  }, []);
  usePortalPolling(load);

  const attention = useMemo<AttentionRow[]>(() => data ? [
    { label: "Inspection queue", count: data.counts.newValidatedTickets + data.counts.inspectionsDue, context: "Validated tickets awaiting site review", href: "/project-head/tickets", priority: 1 },
    { label: "Project setup", count: workflowCounts.readyToCreate + workflowCounts.readyToAssign, context: "Inspected work to create or assign", href: "/project-head/projects", priority: 2 },
    { label: "Coordination", count: data.counts.dependencyRequestsPending, context: "Requests awaiting an agency response", href: "/project-head/dependencies", priority: 3 },
    { label: "Conflicts", count: data.performance.roadConflicts, context: "Advisory overlaps requiring review", href: "/project-head/conflicts", priority: 4 },
    { label: "Approaching deadlines", count: data.counts.attentionActions, context: "Workflow responses due or overdue", href: "/project-head/notifications", priority: 5 },
    { label: "Closure checks", count: workflowCounts.awaitingVerification, context: "Completed work awaiting citizen verification", href: "/project-head/projects?status=AWAITING_VERIFICATION", priority: 6 },
  ].filter((item) => item.count > 0).sort((left, right) => left.priority - right.priority) : [], [data, workflowCounts]);

  return <>
    <PageHeader eyebrow="Operations overview" title={data?.agency.name ?? "Agency operations"} description="Work needing a decision, coordination, or deadline response." action={<Link className="primary-link" href="/project-head/tickets/new">Create agency ticket</Link>} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="portal-muted" role="status">Loading live operations…</p> : null}
    {data ? <div className="overview-layout">
      <section className="operations-list" aria-labelledby="attention-title">
        <header><div><p className="eyebrow">Today</p><h2 id="attention-title">Requires attention</h2></div><span>{attention.reduce((total, item) => total + item.count, 0)} open items</span></header>
        {attention.length ? <ol>{attention.map((item) => <li key={item.label}><div><strong>{item.label}</strong><span>{item.context}</span></div><b>{item.count}</b><Link href={item.href}>Review</Link></li>)}</ol> : <EmptyState title="No immediate actions" description="New assigned work and coordination requests will appear here." />}
      </section>
      <aside className="deadline-summary" aria-labelledby="deadline-title"><p className="eyebrow">Deadlines</p><h2 id="deadline-title">Response watch</h2><strong>{data.counts.attentionActions}</strong><p>workflow actions currently approaching or past their response deadline</p><Link href="/project-head/notifications">Open deadline updates</Link></aside>
      <section className="recent-activity" aria-labelledby="activity-title"><header><div><p className="eyebrow">Execution</p><h2 id="activity-title">Recent work activity</h2></div><Link href="/project-head/projects">View all works</Link></header>{recent.length ? <div className="table-scroll"><table><thead><tr><th>Work</th><th>Status</th><th>Responsible</th><th>Last updated</th></tr></thead><tbody>{recent.map((project) => <tr key={project.id}><td><Link href={`/project-head/projects/${project.id}`}><strong>{project.ticket?.title ?? project.title}</strong><small>{project.ticket?.ward.name ?? "Location pending"}</small></Link></td><td><PortalStatePill state={project.state} /></td><td>{project.engineer?.email ?? "Unassigned"}</td><td>{relativeDate(project.updatedAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No recent execution activity" description="Created and assigned works will be recorded here." />}</section>
    </div> : null}
  </>;
}
