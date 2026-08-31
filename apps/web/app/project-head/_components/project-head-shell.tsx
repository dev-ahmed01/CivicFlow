"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, getSession, logout } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";
import { CitizenIcon, type CitizenIconName } from "../../_components/ui";

const workLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/project-head", label: "Today", icon: "clock", active: (path) => path === "/project-head" },
  { href: "/project-head/projects", label: "Work", icon: "clipboard", active: (path) => path.startsWith("/project-head/projects") || path.startsWith("/project-head/tickets") || path.startsWith("/project-head/grievances") },
  { href: "/project-head/work-calendar", label: "Schedule", icon: "location", active: (path) => path.startsWith("/project-head/work-calendar") },
  { href: "/project-head/dependencies", label: "Coordination", icon: "send", active: (path) => path.startsWith("/project-head/dependencies") || path.startsWith("/project-head/coordination") || path.startsWith("/project-head/conflicts") },
  { href: "/project-head/teams", label: "Team", icon: "person", active: (path) => path.startsWith("/project-head/teams") },
];

const insightLink = { href: "/project-head/reports", label: "Insights", icon: "file" as const, active: (path: string) => path.startsWith("/project-head/reports") };

export function ProjectHeadShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const session = getSession();
  return (
    <div className="portal-shell project-head-shell">
      <aside className={mobileOpen ? "portal-sidebar mobile-open" : "portal-sidebar"}>
        <Link className="portal-brand portal-product-mark" href="/project-head"><span className="portal-logo-mark">CC</span><span><strong>City Connect</strong><small>Operations</small></span></Link>
        <p className="portal-role">Project Head</p>
        <nav aria-label="Project Head navigation">
          <div className="portal-nav-group"><p>Main workspace</p>{workLinks.map((item) => <Link aria-current={item.active(pathname) ? "page" : undefined} className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href} onClick={() => setMobileOpen(false)}><CitizenIcon name={item.icon} size={17} /><span>{item.label}</span></Link>)}</div>
          <div className="portal-nav-group"><p>Secondary</p><Link aria-current={insightLink.active(pathname) ? "page" : undefined} className={insightLink.active(pathname) ? "active" : ""} href={insightLink.href} onClick={() => setMobileOpen(false)}><CitizenIcon name={insightLink.icon} size={17} /><span>{insightLink.label}</span></Link></div>
        </nav>
        <details className="ph-user-control"><summary><span className="ph-user-avatar" aria-hidden="true">PH</span><span><strong>{session?.user.email ?? "Project Head"}</strong><small>Project Head</small></span></summary><div><Link href="/project-head/profile">Profile</Link><button type="button" onClick={() => void signOut()}>Sign out</button></div></details>
      </aside>
      <div className="ph-workspace">
        <header className="ph-topbar"><button aria-expanded={mobileOpen} aria-label="Toggle navigation" className="ph-menu-button" onClick={() => setMobileOpen((open) => !open)} type="button"><span /><span /><span /></button><span className="ph-topbar-context">Municipal operations workspace</span><NotificationBell active={pathname === "/project-head/notifications"} apiFetch={apiFetch} href="/project-head/notifications" /></header>
        <main className="portal-content">{children}</main>
      </div>
    </div>
  );
}
