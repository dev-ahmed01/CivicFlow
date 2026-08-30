"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, getSession, logout } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";

const workLinks: Array<{ href: string; label: string; active: (path: string) => boolean }> = [
  { href: "/project-head", label: "Overview", active: (path) => path === "/project-head" },
  { href: "/project-head/projects", label: "Works", active: (path) => path.startsWith("/project-head/projects") || path.startsWith("/project-head/tickets") },
  { href: "/project-head/work-calendar", label: "Map & calendar", active: (path) => path.startsWith("/project-head/work-calendar") },
  { href: "/project-head/conflicts", label: "Conflicts", active: (path) => path.startsWith("/project-head/conflicts") },
  { href: "/project-head/dependencies", label: "Coordination", active: (path) => path.startsWith("/project-head/dependencies") || path.startsWith("/project-head/coordination") },
  { href: "/project-head/teams", label: "Teams", active: (path) => path.startsWith("/project-head/teams") },
  { href: "/project-head/reports", label: "Reports", active: (path) => path.startsWith("/project-head/reports") },
];

const accountLinks: Array<{ href: string; label: string; active: (path: string) => boolean }> = [
  { href: "/project-head/grievances", label: "Grievances", active: (path) => path.startsWith("/project-head/grievances") },
  { href: "/project-head/profile", label: "Profile", active: (path) => path === "/project-head/profile" },
];

export function ProjectHeadShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const loginPage = pathname === "/project-head/login";

  useEffect(() => {
    if (!loginPage && !getSession()) {
      router.replace("/project-head/login");
      return;
    }
    setReady(true);
  }, [loginPage, router]);

  if (loginPage) return children;
  if (!ready) return <main className="portal-loading">Opening your agency workspace…</main>;

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link className="portal-brand portal-product-mark" href="/project-head"><span className="portal-logo-mark">CC</span><span><strong>City Connect</strong><small>Operations</small></span></Link>
        <p className="portal-role">Project Head workspace</p>
        <nav aria-label="Project Head navigation">
          <div className="portal-nav-group"><p>Workspace</p>{workLinks.map((item) => <Link aria-current={item.active(pathname) ? "page" : undefined} className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}</div>
          <div className="portal-nav-group portal-utility-nav"><p>Account</p><NotificationBell active={pathname === "/project-head/notifications"} apiFetch={apiFetch} href="/project-head/notifications" label="Notifications" />{accountLinks.map((item) => <Link aria-current={item.active(pathname) ? "page" : undefined} className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>)}</div>
        </nav>
        <button className="portal-logout" type="button" onClick={() => void signOut()}>Sign out</button>
      </aside>
      <main className="portal-content">{children}</main>
    </div>
  );
}
