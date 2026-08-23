"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch, clearSession, getSession } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";

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
  return <div className="portal-shell engineer-shell"><aside className="portal-sidebar"><Link className="portal-brand" href="/engineer"><span>C</span>CivicOS</Link><p className="portal-role">Executive Engineer</p><nav aria-label="Engineer navigation"><Link className={pathname === "/engineer" ? "active" : ""} href="/engineer">Dashboard</Link><Link className={pathname === "/engineer/projects" ? "active" : ""} href="/engineer/projects">My projects</Link><Link className={pathname.startsWith("/engineer/assigned") ? "active" : ""} href="/engineer/assigned">Assigned work</Link><Link className={pathname.startsWith("/engineer/geographic") ? "active" : ""} href="/engineer/geographic">Geographic projects</Link><Link className={pathname === "/engineer/notifications" ? "active" : ""} href="/engineer/notifications">Notifications</Link></nav><NotificationBell apiFetch={apiFetch} href="/engineer/notifications" /><button className="portal-logout" type="button" onClick={() => { clearSession(); router.replace("/engineer/login"); }}>Sign out</button></aside><main className="portal-content">{children}</main></div>;
}
