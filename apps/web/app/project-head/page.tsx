"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  notificationDestination,
  notificationPresentation,
  relativeNotificationTime,
  type CivicWorkCalendarItem,
  type Notification,
  type PaginationMeta,
  type ProjectHeadDashboardCounts,
} from "@civicos/shared";
import { EmptyState, PageHeader } from "../_components/ui";
import { usePortalPolling } from "../_lib/portal-refresh";
import { apiFetch } from "./_lib/api";

const WorkMap = dynamic(() => import("./work-calendar/work-map").then((module) => module.WorkMap), {
  ssr: false,
  loading: () => <div className="ph-command-map-loading">Preparing the live work map…</div>,
});

type DashboardResponse = {
  agency: { id: string; name: string };
  counts: ProjectHeadDashboardCounts;
};
type ClientNotification = Omit<Notification, "createdAt"> & { createdAt: string };
type CalendarResponse = { works: CivicWorkCalendarItem[]; pagination: PaginationMeta };
type MapBounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
type AttentionRow = { label: string; count: number; context: string; href: string; action: string; priority: number; tone: "standard" | "warning" | "danger" };

const bengaluruBounds: MapBounds = { minLongitude: 77.56, minLatitude: 12.82, maxLongitude: 77.72, maxLatitude: 12.995 };

function calendarQuery(bounds: MapBounds): string {
  const from = new Date();
  const to = new Date();
  from.setDate(from.getDate() - 14);
  to.setDate(to.getDate() + 60);
  const query = new URLSearchParams({
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
    limit: "80",
    ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])),
  });
  return query.toString();
}

function feedReason(type: string): string {
  if (["CONFLICT_DETECTED", "ROAD_CONFLICT_DETECTED"].includes(type)) return "Overlapping work can create avoidable delay or repeat excavation unless agencies coordinate.";
  if (type === "SEQUENCING_RECOMMENDATION") return "A deterministic road rule has proposed an order for human review.";
  if (["DEPENDENCY_REQUEST", "DEPENDENCY_REQUEST_RE_SENT", "COORDINATION_REQUEST"].includes(type)) return "Another agency needs a timely response before connected work can progress.";
  if (["DEPENDENCY_ESCALATED", "ACTION_ATTENTION"].includes(type)) return "The response window has expired or is close enough to require a decision.";
  if (["PROJECT_COMPLETED", "WORK_COMPLETED"].includes(type)) return "Completion evidence needs review before the work can move toward closure.";
  if (["PROJECT_TIMELINE_MODIFIED", "SEQUENCE_CHANGED"].includes(type)) return "A schedule change can affect dependencies, conflicts, and downstream commitments.";
  return "This recorded event may change the next operational decision for the work.";
}

function feedAction(type: string): string {
  if (["CONFLICT_DETECTED", "ROAD_CONFLICT_DETECTED", "SEQUENCING_RECOMMENDATION"].includes(type)) return "Review conflict";
  if (type.includes("DEPENDENCY") || type.includes("COORDINATION")) return "Open coordination";
  if (type.includes("COMPLETED") || type.includes("COMPLETION")) return "Review completion";
  return "Open record";
}

export default function ProjectHeadCommandCentrePage() {
  const [data, setData] = useState<DashboardResponse>();
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [works, setWorks] = useState<CivicWorkCalendarItem[]>([]);
  const [mapBounds, setMapBounds] = useState<MapBounds>(bengaluruBounds);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [dashboard, feed, calendar] = await Promise.all([
        apiFetch<DashboardResponse>("/project-head/dashboard"),
        apiFetch<{ notifications: ClientNotification[] }>("/notifications?page=1&limit=8"),
        apiFetch<CalendarResponse>(`/civic-works/calendar?${calendarQuery(mapBounds)}`),
      ]);
      setData(dashboard);
      setNotifications(feed.notifications);
      setWorks(calendar.works);
      setSelectedId((current) => current && calendar.works.some(({ id }) => id === current) ? current : undefined);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the command centre");
    }
  }, [mapBounds]);
  usePortalPolling(load);

  const attention = useMemo<AttentionRow[]>(() => {
    if (!data) return [];
    const items: AttentionRow[] = [
      { label: "Inspections awaiting assignment", count: data.counts.inspectionsAwaitingAssignment, context: "Validated citizen issues need an inspection decision.", href: "/project-head/projects?view=INSPECTION", action: "Open intake", priority: 1, tone: "warning" },
      { label: "Submitted inspections awaiting review", count: data.counts.inspectionsAwaitingReview, context: "Inspection findings are ready for a Project Head decision.", href: "/project-head/projects?view=READY", action: "Review inspections", priority: 2, tone: "standard" },
      { label: "Civic work ready for Engineer assignment", count: data.counts.worksReadyForAssignment, context: "Prepared work has no responsible Engineer yet.", href: "/project-head/projects?view=READY", action: "Assign Engineers", priority: 3, tone: "standard" },
      { label: "Incoming coordination requests", count: data.counts.incomingCoordination, context: "Partner agencies are waiting for a response from your agency.", href: "/project-head/dependencies", action: "Open coordination", priority: 4, tone: "warning" },
      { label: "Conflicts without coordination", count: data.counts.conflictsWithoutCoordination, context: "Advisory conflict records have no linked coordination request.", href: "/project-head/conflicts", action: "Review conflicts", priority: 5, tone: "warning" },
      { label: "Approaching or overdue deadlines", count: data.counts.attentionActions, context: "Open workflow actions are due within the next 24 hours.", href: "/project-head/notifications", action: "Review deadlines", priority: 6, tone: "danger" },
      { label: "Completion review", count: data.counts.completionReviews, context: "Completed work is waiting for evidence review or verification.", href: "/project-head/projects?view=CLOSURE", action: "Review completion", priority: 7, tone: "standard" },
      { label: "Escalations", count: data.counts.escalations, context: "Overdue dependencies or reopened citizen issues require intervention.", href: "/project-head/grievances", action: "Resolve escalations", priority: 8, tone: "danger" },
    ];
    return items.filter(({ count }) => count > 0).sort((left, right) => left.priority - right.priority);
  }, [data]);

  const selected = works.find(({ id }) => id === selectedId);
  return <div className="ph-command-page">
    <PageHeader title="Command Centre" description={data ? `${data.agency.name} · What requires my decision today?` : "What requires my decision today?"} action={<Link className="portal-primary-button" href="/project-head/projects/new">+ Register Planned Work</Link>} />
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="portal-muted" role="status">Loading current operations…</p> : null}
    {data ? <>
      <div className="ph-command-primary-grid">
        <section className="ph-decision-register" aria-labelledby="decision-title">
          <header><div><p className="ph-operational-label">Needs decision</p><h2 id="decision-title">Priority actions</h2></div><strong>{attention.reduce((sum, item) => sum + item.count, 0)} open</strong></header>
          {attention.length ? <ol>{attention.slice(0, 6).map((item) => <li data-tone={item.tone} key={item.label}><span className="ph-decision-count">{item.count}</span><div><strong>{item.label}</strong><p>{item.context}</p></div><Link href={item.href}>{item.action} →</Link></li>)}</ol> : <EmptyState title="No immediate decisions" description="New inspection, coordination, conflict, and closure decisions will appear here." />}
        </section>

        <section className="ph-command-map" aria-labelledby="map-title">
          <header><div><p className="ph-operational-label">Live operations</p><h2 id="map-title">Work map overview</h2></div><Link href="/project-head/work-calendar">Open full map ↗</Link></header>
          <WorkMap bounds={mapBounds} onBoundsChange={setMapBounds} onSelect={setSelectedId} selectedId={selectedId} works={works} />
          {selected ? <div className="ph-command-map-selection"><span><strong>{selected.title}</strong><small>{selected.agency.name} · {selected.locationLabel ?? selected.ward?.name ?? "Mapped work"}</small></span><Link href={selected.agency.id === data.agency.id ? `/project-head/projects/${selected.id}` : "/project-head/work-calendar"}>{selected.agency.id === data.agency.id ? "Open work" : "View read-only"} →</Link></div> : <p className="ph-command-map-caption">Select a mapped work to see the responsible agency and open the record.</p>}
        </section>
      </div>

      <section className="ph-live-operations" aria-labelledby="live-title">
        <header><p className="ph-operational-label" id="live-title">Live operations</p><span>Agency-scoped operational status</span></header>
        <dl>
          <div><dt>Active civic works</dt><dd>{data.counts.activeProjects}</dd></div>
          <div><dt>Starting soon</dt><dd>{data.counts.startingSoon}</dd><small>Next 7 days</small></div>
          <div data-tone={data.counts.overdueWorks ? "danger" : "standard"}><dt>Overdue works</dt><dd>{data.counts.overdueWorks}</dd></div>
          <div><dt>Active Engineers</dt><dd>{data.counts.activeEngineers}</dd></div>
          <div data-tone={data.counts.currentConflicts ? "warning" : "standard"}><dt>Current conflicts</dt><dd>{data.counts.currentConflicts}</dd><small>Advisory</small></div>
        </dl>
      </section>

      <section className="ph-automation-feed" aria-labelledby="automation-title">
        <header><div><p className="ph-operational-label">Automation feed</p><h2 id="automation-title">Recorded system activity</h2><span>Real notifications generated by workflow, conflict, and coordination services.</span></div><Link href="/project-head/notifications">View all activity →</Link></header>
        {notifications.length ? <ol>{notifications.slice(0, 6).map((item) => {
          const presentation = notificationPresentation(item.type);
          const destination = notificationDestination(item, "PROJECT_HEAD");
          return <li key={item.id}><span aria-hidden="true" className={`ph-feed-marker ${presentation.tone}`}>{presentation.icon}</span><time>{relativeNotificationTime(item.createdAt)}</time><div><small>What happened</small><strong>{presentation.message}</strong></div><div><small>Why it matters</small><p>{feedReason(item.type)}</p></div><div><small>Next action</small>{destination ? <Link href={destination}>{feedAction(item.type)} →</Link> : <span>No action required</span>}</div></li>;
        })}</ol> : <EmptyState title="No recorded activity yet" description="Workflow events will appear here as the system records them." />}
      </section>
    </> : null}
  </div>;
}
