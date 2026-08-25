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

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "dependencies", label: "Dependencies" },
  { id: "assignments", label: "Assignments" },
  { id: "conflicts", label: "Conflicts" },
  { id: "completion", label: "Completion" },
];

export function NotificationBell({ apiFetch, href }: { apiFetch: ApiFetch; href: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await apiFetch<NotificationListResponse>("/notifications?unread=true");
        if (active) setUnreadCount(result.unreadCount);
      } catch { /* The shell's auth guard handles expired sessions. */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [apiFetch]);
  return <Link aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} className="notification-bell" href={href}>
    <CitizenIcon name="bell" size={24} />
    {unreadCount > 0 ? <strong>{unreadCount > 99 ? "99+" : unreadCount}</strong> : null}
  </Link>;
}

export function NotificationCenter({ apiFetch, role, showFilters, variant = "portal" }: {
  apiFetch: ApiFetch;
  role: UserRole;
  showFilters: boolean;
  variant?: "portal" | "citizen" | "portal-inline";
}) {
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [expandedId, setExpandedId] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await apiFetch<{ notifications: ClientNotification[]; unreadCount: number; pagination: PaginationMeta }>(`/notifications?page=${page}&limit=20`);
      setNotifications(result.notifications.map((item) => ({ ...item, read: true })));
      setPagination(result.pagination);
      const unread = result.notifications.filter((item) => !item.read);
      if (unread.length > 0) await apiFetch("/notifications/read", { method: "PATCH", body: JSON.stringify({ ids: unread.map(({ id }) => id) }) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, page]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const visible = notifications.filter((item) => notificationMatchesFilter(item.type, filter));
    return (["Today", "Yesterday", "Earlier"] as const).map((label) => ({
      label,
      items: visible.filter((item) => notificationDayGroup(item.createdAt) === label),
    })).filter((group) => group.items.length > 0);
  }, [filter, notifications]);

  return <section className={`notification-page ${variant === "citizen" ? "cf-notification-page" : ""} ${variant === "portal-inline" ? "portal-notification-page" : ""}`}>
    <div className="portal-heading"><div><p className="eyebrow">Updates</p><h1>Notifications</h1><p>Everything that needs your attention, newest first.</p></div></div>
    {showFilters ? <div aria-label="Notification filters" className="notification-filters" role="tablist">
      {filters.map((item) => <button aria-selected={filter === item.id} className={filter === item.id ? "active" : ""} key={item.id} onClick={() => setFilter(item.id)} role="tab" type="button">{item.label}</button>)}
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p className="portal-muted">Loading notifications…</p> : null}
    {!loading && grouped.length === 0 ? <div className="notification-empty"><CitizenIcon name="bell" /><p>You’re all caught up — no notifications here yet.</p></div> : null}
    <div className="notification-groups">
      {grouped.map((group) => <section key={group.label}><h2>{group.label}</h2><div className="notification-list">
        {group.items.map((item) => {
          const display = notificationPresentation(item.type);
          const href = notificationDestination(item, role);
          if (variant === "portal") return <NotificationRow href={href ?? undefined} icon={display.icon} key={item.id} message={display.message} time={relativeNotificationTime(item.createdAt)} tone={display.tone} />;
          const expanded = expandedId === item.id;
          let contextHref = href;
          if (href?.startsWith("/tickets/")) contextHref = `/tickets?ticket=${href.slice("/tickets/".length)}`;
          if (href?.startsWith("/project-head/tickets/")) contextHref = `/project-head/tickets?ticket=${href.slice("/project-head/tickets/".length)}`;
          if (href?.startsWith("/project-head/projects/")) contextHref = `/project-head/projects?project=${href.slice("/project-head/projects/".length)}`;
          if (href?.startsWith("/engineer/projects/")) contextHref = `/engineer/projects?project=${href.slice("/engineer/projects/".length)}`;
          return <div className="cf-notification-row" key={item.id}>
            <span aria-hidden="true" className={`cv-notification-icon ${display.tone}`}>{display.icon}</span>
            <span className="cv-notification-copy"><strong>{display.message}</strong><small>{relativeNotificationTime(item.createdAt)}</small></span>
            <ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close" : "View"}</ActionButton>
            {expanded ? <div className="cf-notification-detail"><p>{display.message}</p><small>This update was recorded {new Date(item.createdAt).toLocaleString("en-IN")}.</small>{contextHref ? <ActionButton href={contextHref}>Open context</ActionButton> : null}</div> : null}
          </div>;
        })}
      </div></section>)}
    </div>
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </section>;
}
