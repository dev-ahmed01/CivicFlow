"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearSession, getSession } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";
import { CitizenIcon, type CitizenIconName } from "../../_components/ui";

const workLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/engineer", label: "Overview", icon: "file", active: (path) => path === "/engineer" },
  { href: "/engineer/projects", label: "Projects", icon: "clipboard", active: (path) => path.startsWith("/engineer/projects") },
  { href: "/engineer/dependencies", label: "Dependencies", icon: "refresh", active: (path) => path.startsWith("/engineer/dependencies") },
];

const accountLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/engineer/profile", label: "Profile", icon: "person", active: (path) => path === "/engineer/profile" },
];

export function EngineerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const loginPage = pathname === "/engineer/login";

  useEffect(() => {
    if (!loginPage && !getSession()) { router.replace("/engineer/login"); return; }
    setReady(true);
  }, [loginPage, router]);

  if (loginPage) return children;
  if (!ready) return <main className="portal-loading">Opening field operations…</main>;

  return <div className="portal-shell engineer-shell">
    <aside className="portal-sidebar">
      <Link className="portal-brand portal-product-mark" href="/engineer"><span className="portal-logo-mark">C</span><span><strong>CITY</strong><b>CONNECT</b></span></Link>
      <p className="portal-role">Executive Engineer</p>
      <nav aria-label="Engineer navigation">
        <div className="portal-nav-group"><p>Work</p>{workLinks.map((item) => <Link className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
        <div className="portal-nav-group"><p>Account</p><NotificationBell active={pathname === "/engineer/notifications"} apiFetch={apiFetch} href="/engineer/notifications" label="Notifications" />{accountLinks.map((item) => <Link className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
      </nav>
      <button className="portal-logout" type="button" onClick={() => { clearSession(); router.replace("/login"); }}><CitizenIcon name="logout" size={19} />Sign out</button>
    </aside>
    <main className="portal-content">{children}</main>
  </div>;
}
