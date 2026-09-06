import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "../../_components/ui";

export function EngineerSymbol({ name }: { name: string }) {
  return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === "search" ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></> : name === "filter" ? <path d="M3 5h18M6 12h12m-9 7h6" /> : name === "menu" ? <path d="M3 6h18M3 12h18M3 18h18" /> : name === "close" ? <path d="m6 6 12 12M6 18 18 6" /> : name === "bell" ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></> : name === "people" ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" /></> : name === "blocked" ? <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></> : name === "attention" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></> : name === "tip" ? <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 3H9zM12 1v1M2 10H1m22 0h-1M4 3l1 1m14 0 1-1" /></> : name === "work" ? <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></> : name === "check" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : name === "clock" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : name === "location" ? <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></> : <><rect x="4" y="5" width="16" height="16" rx="2" /><path d={name === "calendar" ? "M8 3v5m8-5v5M4 11h16" : "M12 2v12m-4-4 4 4 4-4"} /></>}
  </svg>;
}

export function EngineerTip({ children }: { children: ReactNode }) {
  return <aside className="engineer-tip"><span className="engineer-symbol green"><EngineerSymbol name="tip" /></span><p><strong>Tip: </strong>{children}</p></aside>;
}

export function EngineerStatCard({ count, label, note, icon, tone, selected, onClick, href }: {
  count: number | undefined; label: string; note: string; icon: string; tone: string;
  selected?: boolean; onClick?: () => void; href?: string;
}) {
  const content = <><span className={`engineer-symbol ${tone}`}><EngineerSymbol name={icon} /></span><div><strong>{count ?? "—"}</strong><span>{label}</span><small>{note}</small></div></>;
  const className = `engineer-stat engineer-stat-control${selected ? " selected" : ""}`;
  return href ? <Link className={className} href={href}>{content}</Link> : <button className={className} aria-pressed={selected} type="button" onClick={onClick}>{content}</button>;
}

export function EngineerSummary({ count, label }: { count: number | undefined; label: string }) {
  return <div className="engineer-dependency-summary"><strong>{count ?? "—"}</strong><span>{label}</span></div>;
}

export function EngineerHeader({ eyebrow, title, description, count, countLabel }: {
  eyebrow: string; title: string; description: string; count?: number; countLabel?: string;
}) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} action={countLabel ? <EngineerSummary count={count} label={countLabel} /> : undefined} />;
}

export function EngineerDateStamp() {
  const label = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return <div className="engineer-date-stamp"><EngineerSymbol name="calendar" /><span>{label}</span></div>;
}

export function EngineerQueue({ title, href, count, children }: { title: string; href?: string; count: number; children: ReactNode }) {
  return <section className="engineer-queue"><header><h2>{title}<span>{count}</span></h2>{href ? <Link href={href}>View all <span aria-hidden="true">→</span></Link> : null}</header><div className="engineer-queue-list">{children}</div></section>;
}

export function EngineerLoading({ label = "Loading work" }: { label?: string }) {
  return <div className="engineer-loading" role="status"><span>{label}…</span><div aria-hidden="true" /><div aria-hidden="true" /><div aria-hidden="true" /></div>;
}

export function engineerDate(value: string | Date | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not scheduled";
}
