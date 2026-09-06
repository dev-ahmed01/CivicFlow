"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  notificationDayGroup,
  notificationDestination,
  notificationMatchesFilter,
  notificationPresentation,
  relativeNotificationTime,
  type Notification,
  type NotificationFilter,
  type NotificationListResponse,
  type PaginationMeta,
  type UserRole,
} from "@civicos/shared";
import { ActionButton, CitizenIcon, NotificationRow, PaginationControls } from "./ui";

type ClientNotification = Omit<Notification, "createdAt"> & { createdAt: string };
type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
type NotificationVariant = "portal" | "citizen" | "portal-inline";
type NotificationRun = { id: string; type: string; items: ClientNotification[] };

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "dependencies", label: "Dependencies" },
  { id: "assignments", label: "Assignments" },
  { id: "conflicts", label: "Conflicts" },
  { id: "completion", label: "Completion" },
  { id: "grievances", label: "Grievances" },
];

function consecutiveRuns(items: ClientNotification[]): NotificationRun[] {
  const runs: NotificationRun[] = [];
  for (const item of items) {
    const previous = runs.at(-1);
    if (previous?.type === item.type) previous.items.push(item);
    else runs.push({ id: item.id, type: item.type, items: [item] });
  }
  return runs;
}

function payloadContext(payload: Record<string, unknown>): string {
  const identifiers = [
    ["Ticket", payload.ticketId],
    ["Project", payload.projectId],
    ["Dependency", payload.dependencyId],
    ["Grievance", payload.grievanceId],
  ].flatMap(([label, identifier]) => typeof identifier === "string" ? [`${label} ${identifier}`] : []);
  return identifiers.join(" · ") || "Civic work update";
}

function groupMessage(type: string, count: number, fallback: string): string {
  if (type === "ROAD_CONFLICT_DETECTED") return `${count} non-blocking road conflicts need review`;
  if (type === "CONFLICT_DETECTED") return `${count} non-blocking project conflicts need review`;
  return `${count} updates · ${fallback}`;
}

function categoryLabel(type: string): string {
  return filters.find((filter) => filter.id !== "all" && notificationMatchesFilter(type, filter.id))?.label ?? "Updates";
}

function feedContext(item: ClientNotification): string | undefined {
  const value = item.payload.subject ?? item.payload.projectTitle ?? item.payload.ticketTitle ?? item.payload.locationLabel;
  return typeof value === "string" ? value : undefined;
}

function contextDestination(href: string | undefined, variant: NotificationVariant): string | undefined {
  if (!href || variant === "portal") return href;
  return href;
}

export function NotificationBell({ apiFetch, href, label, active = false }: { apiFetch: ApiFetch; href: string; label?: string; active?: boolean }) {
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let activeRequest = true;
    const poll = async () => {
      try {
        const result = await apiFetch<NotificationListResponse>("/notifications?unread=true");
        if (activeRequest) setUnreadCount(result.unreadCount);
      } catch { /* The shell's auth guard handles expired sessions. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    return () => { activeRequest = false; window.clearInterval(timer); };
  }, [apiFetch]);
  return <Link aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} className={`notification-bell ${label ? "nav-notification-bell" : ""} ${active ? "active" : ""}`.trim()} href={href}>
    <CitizenIcon name="bell" size={label ? 18 : 24} />
    {label ? <span>{label}</span> : null}
    {unreadCount > 0 ? <strong>{unreadCount > 99 ? "99+" : unreadCount}</strong> : null}
  </Link>;
}

export function NotificationCenter({ apiFetch, role, showFilters, variant = "portal", navigation }: {
  apiFetch: ApiFetch;
  role: UserRole;
  showFilters: boolean;
  variant?: NotificationVariant;
  navigation?: { filter: NotificationFilter; page: number; onFilter: (filter: NotificationFilter) => void; onPage: (page: number) => void };
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [localFilter, setLocalFilter] = useState<NotificationFilter>("all");
  const filter = navigation?.filter ?? localFilter;
  const setFilter = navigation?.onFilter ?? setLocalFilter;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [localPage, setLocalPage] = useState(1);
  const page = navigation?.page ?? localPage;
  const setPage = navigation?.onPage ?? setLocalPage;
  const engineerFilter = role === "ENGINEER" ? filter : "all";
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [expandedId, setExpandedId] = useState<string>();
  const [expandedRunId, setExpandedRunId] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await apiFetch<{ notifications: ClientNotification[]; unreadCount: number; pagination: PaginationMeta }>(`/notifications?page=${role === "ENGINEER" ? 1 : page}&limit=20`);
      if (role === "ENGINEER") {
        for (let next = 2; next <= result.pagination.totalPages; next++) {
          const more = await apiFetch<{ notifications: ClientNotification[] }>(`/notifications?page=${next}&limit=20`);
          result.notifications.push(...more.notifications);
        }
      }
      setNotifications(result.notifications.map((item) => ({ ...item, read: true })));
      setUnreadCount(result.unreadCount);
      setPagination(result.pagination);
      const visible = role === "ENGINEER" ? result.notifications.filter((item) => notificationMatchesFilter(item.type, engineerFilter)).slice((page - 1) * 20, page * 20) : result.notifications;
      const unread = visible.filter((item) => !item.read);
      if (unread.length > 0) await apiFetch("/notifications/read", { method: "PATCH", body: JSON.stringify({ ids: unread.map(({ id }) => id) }) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page, role, engineerFilter]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const matching = notifications.filter((item) => notificationMatchesFilter(item.type, filter));
    const visible = role === "ENGINEER" ? matching.slice((page - 1) * 20, page * 20) : matching;
    return (["Today", "Yesterday", "Earlier"] as const).map((label) => ({
      label,
      runs: consecutiveRuns(visible.filter((item) => notificationDayGroup(item.createdAt) === label)),
    })).filter((group) => group.runs.length > 0);
  }, [filter, notifications, page, role]);

  return <section className={`notification-page ${variant === "citizen" ? "cf-notification-page" : ""} ${variant === "portal-inline" ? "portal-notification-page" : ""}`}>
    <div className="portal-heading"><div><p className="eyebrow">Updates</p><h1>Notifications</h1><p>Everything that needs your attention, newest first.</p></div>{role === "ENGINEER" ? <div className="engineer-dependency-summary" title="Unread notifications when this page was opened"><strong>{loading ? "—" : unreadCount}</strong><span>unread</span></div> : null}</div>
    {showFilters ? <div aria-label="Notification filters" className="notification-filters" role="tablist">
      {(role === "ENGINEER" ? filters.filter((item) => item.id === "all" || notifications.some((notification) => notificationMatchesFilter(notification.type, item.id))) : filters).map((item) => <button aria-selected={filter === item.id} className={filter === item.id ? "active" : ""} key={item.id} onClick={() => setFilter(item.id)} role="tab" type="button">{item.label}</button>)}
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p className="portal-muted">Loading notifications…</p> : null}
    {!loading && grouped.length === 0 ? <div className="notification-empty"><CitizenIcon name="bell" /><p>You’re all caught up — no notifications here yet.</p></div> : null}
    <div className="notification-groups">
      {grouped.map((group) => <section key={group.label}><h2>{group.label}</h2><div className="notification-list">
        {group.runs.map((run) => {
          const display = notificationPresentation(run.type);
          if (run.items.length > 1) {
            const expanded = expandedRunId === run.id;
            return <div className="cf-notification-row notification-cluster" key={run.id}>
              <span aria-hidden="true" className={`cv-notification-icon ${display.tone}`}>{display.icon}</span>
              <span className="cv-notification-copy"><strong>{groupMessage(run.type, run.items.length, display.message)}</strong>{(role === "PROJECT_HEAD" || role === "ENGINEER") && feedContext(run.items[0]!) ? <span>{feedContext(run.items[0]!)}</span> : null}<small>{relativeNotificationTime(run.items[0]!.createdAt)} · {run.items.length} individual updates</small></span>
              {role !== "CITIZEN" ? <span className={`ph-notification-category ${display.tone}`}>{categoryLabel(run.type)}</span> : null}
              <ActionButton expanded={expanded} onClick={() => setExpandedRunId(expanded ? undefined : run.id)}>{expanded ? "Collapse" : "Expand"}</ActionButton>
              {expanded ? <div className="notification-cluster-details">{run.items.map((item) => {
                const href = contextDestination(notificationDestination(item, role), variant);
                return <article key={item.id}><div><strong>{payloadContext(item.payload)}</strong><small>{new Date(item.createdAt).toLocaleString("en-IN")}</small></div>{href ? <ActionButton href={href}>Open update</ActionButton> : null}</article>;
              })}</div> : null}
            </div>;
          }

          const item = run.items[0]!;
          const href = notificationDestination(item, role);
          if (variant === "portal") return <NotificationRow href={href ?? undefined} icon={display.icon} key={item.id} message={display.message} time={relativeNotificationTime(item.createdAt)} tone={display.tone} />;
          const expanded = expandedId === item.id;
          const contextHref = contextDestination(href, variant);
          return <div className="cf-notification-row" key={item.id}>
            <span aria-hidden="true" className={`cv-notification-icon ${display.tone}`}>{display.icon}</span>
            <span className="cv-notification-copy"><strong>{display.message}</strong>{(role === "PROJECT_HEAD" || role === "ENGINEER") && feedContext(item) ? <span>{feedContext(item)}</span> : null}<small>{relativeNotificationTime(item.createdAt)}</small></span>
            {role !== "CITIZEN" ? <span className={`ph-notification-category ${display.tone}`}>{categoryLabel(item.type)}</span> : null}
            {role === "ENGINEER" && contextHref ? <ActionButton href={contextHref}>{contextHref.includes("/inspections/") ? "Inspect" : contextHref.includes("/dependencies") ? "View dependency" : contextHref.includes("/projects/") ? (notificationMatchesFilter(item.type, "assignments") ? "View assignment" : "Open work") : "View details"}</ActionButton> : <ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close" : "Inspect"}</ActionButton>}
            {expanded ? <div className="cf-notification-detail"><p>{payloadContext(item.payload)}</p><small>This update was recorded {new Date(item.createdAt).toLocaleString("en-IN")}.</small>{contextHref ? <ActionButton href={contextHref}>Open related item</ActionButton> : null}</div> : null}
          </div>;
        })}
      </div></section>)}
    </div>
    <PaginationControls page={role === "ENGINEER" ? page : pagination.page} totalPages={role === "ENGINEER" ? Math.max(1, Math.ceil(notifications.filter((item) => notificationMatchesFilter(item.type, filter)).length / 20)) : pagination.totalPages} onPageChange={setPage} />
  </section>;
}
