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
  type UserRole,
} from "@civicos/shared";
import { NotificationRow } from "./ui";

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
    <span aria-hidden="true">♢</span>
    {unreadCount > 0 ? <strong>{unreadCount > 99 ? "99+" : unreadCount}</strong> : null}
  </Link>;
}

export function NotificationCenter({ apiFetch, role, showFilters }: { apiFetch: ApiFetch; role: UserRole; showFilters: boolean }) {
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await apiFetch<{ notifications: ClientNotification[]; unreadCount: number }>("/notifications");
      setNotifications(result.notifications.map((item) => ({ ...item, read: true })));
      const unread = result.notifications.filter((item) => !item.read);
      await Promise.all(unread.map((item) => apiFetch(`/notifications/${item.id}/read`, { method: "PATCH" })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const visible = notifications.filter((item) => notificationMatchesFilter(item.type, filter));
    return (["Today", "Yesterday", "Earlier"] as const).map((label) => ({
      label,
      items: visible.filter((item) => notificationDayGroup(item.createdAt) === label),
    })).filter((group) => group.items.length > 0);
  }, [filter, notifications]);

  return <section className="notification-page">
    <div className="portal-heading">
      <div><p className="eyebrow">Updates</p><h1>Notifications</h1><p>Everything that needs your attention, newest first.</p></div>
    </div>
    {showFilters ? <div aria-label="Notification filters" className="notification-filters" role="tablist">
      {filters.map((item) => <button aria-selected={filter === item.id} className={filter === item.id ? "active" : ""} key={item.id} onClick={() => setFilter(item.id)} role="tab" type="button">{item.label}</button>)}
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p className="portal-muted">Loading notifications…</p> : null}
    {!loading && grouped.length === 0 ? <div className="notification-empty"><span aria-hidden="true">♢</span><p>You’re all caught up — no notifications here yet.</p></div> : null}
    <div className="notification-groups">
      {grouped.map((group) => <section key={group.label}><h2>{group.label}</h2><div className="notification-list">
        {group.items.map((item) => {
          const display = notificationPresentation(item.type);
          const href = notificationDestination(item, role);
          return <NotificationRow href={href ?? undefined} icon={display.icon} key={item.id} message={display.message} time={relativeNotificationTime(item.createdAt)} tone={display.tone} />;
        })}
      </div></section>)}
    </div>
  </section>;
}
