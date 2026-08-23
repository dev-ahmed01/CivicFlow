"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearSession, getSession } from "../_lib/api";

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

  const logout = () => {
    clearSession();
    router.replace("/project-head/login");
  };
  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <Link className="portal-brand" href="/project-head"><span>C</span>CivicOS</Link>
        <p className="portal-role">Project Head</p>
        <nav aria-label="Project Head navigation">
          <Link className={pathname === "/project-head" ? "active" : ""} href="/project-head">Overview</Link>
          <Link className={pathname.startsWith("/project-head/tickets") && pathname !== "/project-head/tickets/new" ? "active" : ""} href="/project-head/tickets">Ticket queue</Link>
          <Link className={pathname.startsWith("/project-head/projects") ? "active" : ""} href="/project-head/projects">Projects</Link>
          <Link className={pathname === "/project-head/tickets/new" ? "active" : ""} href="/project-head/tickets/new">Create agency ticket</Link>
        </nav>
        <button className="portal-logout" type="button" onClick={logout}>Sign out</button>
      </aside>
      <main className="portal-content">{children}</main>
    </div>
  );
}
