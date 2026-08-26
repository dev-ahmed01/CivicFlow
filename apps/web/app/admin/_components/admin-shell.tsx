"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getAdminSession, logoutAdmin } from "../_lib/api";

const links = [
  ["Analytics", "/admin"], ["Categories", "/admin/categories"], ["Routing rules", "/admin/routing-rules"],
  ["Wards", "/admin/wards"], ["Config", "/admin/config"], ["Agencies", "/admin/agencies"],
  ["Users", "/admin/users"], ["2FA security", "/admin/security"],
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const loginPage = pathname === "/admin/login";
  useEffect(() => {
    if (!loginPage && !getAdminSession()) { router.replace("/admin/login"); return; }
    setReady(true);
  }, [loginPage, router]);
  if (loginPage) return children;
  if (!ready) return <main className="portal-loading">Opening city administration…</main>;
  return <div className="portal-shell admin-shell">
    <aside className="portal-sidebar">
      <Link className="portal-brand" href="/admin"><span>C</span>CivicOS</Link>
      <p className="portal-role">City Administrator</p>
      <nav aria-label="Admin navigation">{links.map(([label, href]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav>
      <Link className="public-link" href="/transparency">Public dashboard ↗</Link>
      <button className="portal-logout" type="button" onClick={() => void logoutAdmin().finally(() => router.replace("/login"))}>Sign out</button>
    </aside>
    <main className="portal-content">{children}</main>
  </div>;
}
