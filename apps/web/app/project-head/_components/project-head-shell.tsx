"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, getSession, logout } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";
import { CitizenIcon, type CitizenIconName } from "../../_components/ui";

const workLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/project-head", label: "Overview", icon: "file", active: (path) => path === "/project-head" },
  { href: "/project-head/tickets", label: "Ticket queue", icon: "clipboard", active: (path) => path.startsWith("/project-head/tickets") },
  { href: "/project-head/projects", label: "Projects", icon: "location", active: (path) => path.startsWith("/project-head/projects") },
  { href: "/project-head/work-calendar", label: "Work calendar", icon: "clock", active: (path) => path.startsWith("/project-head/work-calendar") },
  { href: "/project-head/dependencies", label: "Dependencies", icon: "refresh", active: (path) => path.startsWith("/project-head/dependencies") },
  { href: "/project-head/grievances", label: "Grievances", icon: "clipboard", active: (path) => path.startsWith("/project-head/grievances") },
];

const accountLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/project-head/profile", label: "Profile", icon: "person", active: (path) => path === "/project-head/profile" },
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
        <Link className="portal-brand portal-product-mark" href="/project-head"><span className="portal-logo-mark">C</span><span><strong>CITY</strong><b>CONNECT</b></span></Link>
        <p className="portal-role">Project Head</p>
        <nav aria-label="Project Head navigation">
          <div className="portal-nav-group"><p>Work</p>{workLinks.map((item) => <Link className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
          <div className="portal-nav-group"><p>Account</p><NotificationBell active={pathname === "/project-head/notifications"} apiFetch={apiFetch} href="/project-head/notifications" label="Notifications" />{accountLinks.map((item) => <Link className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
        </nav>
        <button className="portal-logout" type="button" onClick={() => void signOut()}><CitizenIcon name="logout" size={19} />Sign out</button>
      </aside>
      <main className="portal-content">{children}</main>
    </div>
  );
}
