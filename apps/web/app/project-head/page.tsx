"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  type ProjectHeadTicketSummary,
  type ProjectHeadDashboardCounts,
  type ProjectListItem,
} from "@civicos/shared";
import { AttentionCard } from "./_components/attention-card";
import { getShortWorkLocation } from "./_lib/work-summary";
import { EmptyState, PageHeader } from "../_components/ui";
import { usePortalPolling } from "../_lib/portal-refresh";
import { apiFetch } from "./_lib/api";
import { loadAllAgencyProjects } from "./_lib/paginated-projects";
import { ProjectHeadRecordQuickView, type QuickRecord } from "./_components/record-quick-view";
import { workStateLabel } from "./_components/work-ui";

type DashboardResponse = {
  agency: { id: string; name: string };
  counts: ProjectHeadDashboardCounts;
};
type AttentionRow = { label: string; count: number; context: string; href: string; action: string; priority: number; tone: "standard" | "warning" | "danger" };

export default function ProjectHeadCommandCentrePage() {
  const [data, setData] = useState<DashboardResponse>();
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [quickRecord, setQuickRecord] = useState<QuickRecord>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [dashboard, ticketResult, projectResult] = await Promise.all([
        apiFetch<DashboardResponse>("/project-head/dashboard"),
        apiFetch<{ tickets: ProjectHeadTicketSummary[] }>("/tickets?page=1&limit=50"),
        loadAllAgencyProjects(),
      ]);
      setData(dashboard);
      setTickets(ticketResult.tickets);
      setProjects(projectResult);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the command centre");
    }
  }, []);
  usePortalPolling(load);

  const attention = useMemo<AttentionRow[]>(() => {
    if (!data) return [];
    const items: AttentionRow[] = [
      { label: "Inspections awaiting assignment", count: data.counts.inspectionsAwaitingAssignment, context: "Validated citizen issues need an inspection decision.", href: "/project-head/projects?view=INTAKE", action: "Inspect", priority: 1, tone: "warning" },
      { label: "Submitted inspections awaiting review", count: data.counts.inspectionsAwaitingReview, context: "Inspection findings are ready for a Project Head decision.", href: "/project-head/projects?view=READY", action: "Review inspections", priority: 2, tone: "standard" },
      { label: "Civic work ready for Engineer assignment", count: data.counts.worksReadyForAssignment, context: "Prepared work has no responsible Engineer yet.", href: "/project-head/projects?view=READY", action: "Assign engineers", priority: 3, tone: "standard" },
      { label: "Incoming coordination requests", count: data.counts.incomingCoordination, context: "Partner agencies are waiting for a response from your agency.", href: "/project-head/dependencies", action: "Open coordination", priority: 4, tone: "warning" },
      { label: "Conflicts without coordination", count: data.counts.conflictsWithoutCoordination, context: "Advisory conflict records have no linked coordination request.", href: "/project-head/conflicts", action: "Review conflicts", priority: 5, tone: "warning" },
      { label: "Approaching or overdue deadlines", count: data.counts.attentionActions, context: "Open workflow actions are due within the next 24 hours.", href: "/project-head/notifications", action: "Review deadlines", priority: 6, tone: "danger" },
      { label: "Completion review", count: data.counts.completionReviews, context: "Completed work is waiting for evidence review or verification.", href: "/project-head/projects?view=CLOSURE", action: "Review completion", priority: 7, tone: "standard" },
      { label: "Escalations", count: data.counts.escalations, context: "Overdue dependencies or reopened citizen issues require intervention.", href: "/project-head/grievances", action: "Resolve escalations", priority: 8, tone: "danger" },
    ];
    return items.filter(({ count }) => count > 0).sort((left, right) => left.priority - right.priority);
  }, [data]);

  const quickActions = useMemo(() => {
    const ticketItems = tickets.filter((ticket) => ["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE"].includes(ticket.state)).map((ticket) => ({
      id: ticket.id, kind: "ticket" as const, reference: ticket.referenceNumber, title: ticket.title,
      location: getShortWorkLocation(ticket),
      state: workStateLabel(ticket.state), action: ["ROUTED_TO_AGENCY", "INSPECTION_DUE"].includes(ticket.state) ? "Assign inspection" : "Review inspection",
      rank: ticket.state === "INSPECTION_COMPLETE" ? 1 : 0,
    }));
    const projectItems = projects.filter((project) => ["CREATED", "COMPLETED", "AWAITING_VERIFICATION"].includes(project.state) || project.conflictCount + project.roadConflictCount > project.coordinationCount).map((project) => ({
      id: project.id, kind: "project" as const, reference: project.referenceNumber, title: project.title,
      location: getShortWorkLocation(project),
      state: workStateLabel(project.state), action: project.state === "CREATED" ? "Assign engineer" : ["COMPLETED", "AWAITING_VERIFICATION"].includes(project.state) ? "Review completion" : "Coordinate",
      rank: project.state === "CREATED" ? 2 : project.state === "COMPLETED" ? 3 : 4,
    }));
    return [...ticketItems, ...projectItems].sort((left, right) => left.rank - right.rank).slice(0, 4);
  }, [projects, tickets]);

  return <div className="ph-command-page">
    <PageHeader title="Today" description={data ? `${data.agency.name} · Decisions and work that need attention now.` : "Decisions and work that need attention now."} action={<Link className="portal-primary-button" href="/project-head/projects/new">Register planned work</Link>} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="portal-muted" role="status">Loading current operations…</p> : null}
    {data ? <>
      <div className="ph-command-primary-grid">
        <section className="ph-decision-register" aria-labelledby="decision-title">
          <header><div><h2 id="decision-title">Needs your attention</h2></div><Link href="/project-head/projects">{attention.reduce((sum, item) => sum + item.count, 0)} open &rarr;</Link></header>
          {quickActions.length ? <div className="ph-action-card-list">{quickActions.map((item) => <AttentionCard actionLabel={item.action} key={`${item.kind}:${item.id}`} location={item.location} onOpen={() => setQuickRecord({ id: item.id, kind: item.kind })} reference={item.reference} state={item.state} title={item.title} tone={item.action === "Coordinate" ? "warning" : item.action === "Review completion" ? "success" : "info"} />)}</div> : attention.length ? <ol>{attention.slice(0, 6).map((item) => <li data-tone={item.tone} key={item.label}><span className="ph-decision-count">{item.count}</span><div><strong>{item.label}</strong><p>{item.context}</p></div><Link href={item.href}>{item.action} →</Link></li>)}</ol> : <EmptyState title="No immediate decisions" description="New inspection, coordination, conflict, and closure decisions will appear here." />}
        </section>

        <section className="ph-surface ph-command-centre" aria-labelledby="command-centre-title">
          <h2 id="command-centre-title">Work Command Centre</h2><p>Get a quick view of all work and drill down to take action.</p>
          <div className="ph-command-cards">
            <Link data-tone="active" href="/project-head/projects?view=ACTIVE"><strong>{data.counts.activeProjects}</strong><span aria-hidden="true">&rarr;</span><h3>Active</h3><p>Work delivery in progress across your agency.</p></Link>
            <Link data-tone="conflict" href="/project-head/conflicts"><strong>{data.counts.currentConflicts}</strong><span aria-hidden="true">&rarr;</span><h3>Conflict</h3><p>Advisory overlaps that need review.</p></Link>
            <Link data-tone="overdue" href="/project-head/projects?due=overdue"><strong>{data.counts.overdueWorks}</strong><span aria-hidden="true">&rarr;</span><h3>Overdue</h3><p>Past the planned end date and awaiting action.</p></Link>
            <Link data-tone="upcoming" href="/project-head/projects?due=upcoming"><strong>{data.counts.startingSoon}</strong><span aria-hidden="true">&rarr;</span><h3>Upcoming</h3><p>Starting in the next 7 days.</p></Link>
          </div>
        </section>
      </div>
      <ProjectHeadRecordQuickView onChanged={() => void load()} onClose={() => setQuickRecord(undefined)} record={quickRecord} />
    </> : null}
  </div>;
}
