"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch, getSession, logout } from "../_lib/api";
import { NotificationBell } from "../../_components/notification-center";
import { CitizenIcon, type CitizenIconName } from "../../_components/ui";
import { EngineerSymbol } from "./engineer-ui";

const workLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/engineer", label: "Today", icon: "clock", active: (path) => path === "/engineer" },
  { href: "/engineer/inspections", label: "Inspections", icon: "file", active: (path) => path.startsWith("/engineer/inspections") },
  { href: "/engineer/projects", label: "My Work", icon: "clipboard", active: (path) => path.startsWith("/engineer/projects") },
  { href: "/engineer/dependencies", label: "Dependencies", icon: "refresh", active: (path) => path.startsWith("/engineer/dependencies") },
  { href: "/engineer/map", label: "Map", icon: "location", active: (path) => path.startsWith("/engineer/map") },
];

const accountLinks: Array<{ href: string; label: string; icon: CitizenIconName; active: (path: string) => boolean }> = [
  { href: "/engineer/profile", label: "Profile", icon: "person", active: (path) => path === "/engineer/profile" },
];

export function EngineerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const loginPage = pathname === "/engineer/login";

  useEffect(() => {
    if (!loginPage && !getSession()) { router.replace("/engineer/login"); return; }
    setReady(true);
  }, [loginPage, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 781px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const main = mainRef.current;
    document.body.style.overflow = "hidden";
    if (main) main.inert = true;
    sidebarRef.current?.querySelector<HTMLButtonElement>(".engineer-drawer-close")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== "Tab") return;
      const elements = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (main) main.inert = false;
      document.removeEventListener("keydown", onKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  if (loginPage) return children;
  if (!ready) return <main className="portal-loading">Opening field operations…</main>;

  return <div className="portal-shell engineer-shell">
    <a className="engineer-skip" href="#engineer-main">Skip to content</a>
    <header className="engineer-mobile-header"><button ref={menuButtonRef} aria-label="Open navigation" aria-controls="engineer-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} type="button"><EngineerSymbol name="menu" /></button><Link href="/engineer">CITY CONNECT<small>Executive Engineer</small></Link></header>
    {menuOpen ? <button className="engineer-drawer-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} tabIndex={-1} type="button" /> : null}
    <aside className={`portal-sidebar ${menuOpen ? "engineer-drawer-open" : ""}`} id="engineer-sidebar" ref={sidebarRef} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} aria-label="Executive Engineer navigation">
      <button className="engineer-drawer-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)} type="button"><EngineerSymbol name="close" /></button>
      <Link className="portal-brand portal-product-mark" href="/engineer" onClick={() => setMenuOpen(false)}><span className="portal-logo-mark" aria-hidden="true" /><span><strong>CITY</strong><b>CONNECT</b></span></Link>
      <p className="portal-role">Executive Engineer</p>
      <nav aria-label="Engineer navigation" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
        <div className="portal-nav-group"><p>Work</p>{workLinks.map((item) => <Link aria-current={item.active(pathname) ? "page" : undefined} className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
        <div className="portal-nav-group"><p>Account</p><NotificationBell active={pathname === "/engineer/notifications"} apiFetch={apiFetch} href="/engineer/notifications" label="Notifications" />{accountLinks.map((item) => <Link aria-current={item.active(pathname) ? "page" : undefined} className={item.active(pathname) ? "active" : ""} href={item.href} key={item.href}><CitizenIcon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>
      </nav>
      <button className="portal-logout" type="button" onClick={() => void logout().finally(() => router.replace("/login"))}><CitizenIcon name="logout" size={19} />Sign out</button>
    </aside>
    <main className="portal-content" id="engineer-main" ref={mainRef} tabIndex={-1}>{children}</main>
  </div>;
}
