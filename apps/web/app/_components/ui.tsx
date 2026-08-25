"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SemanticTone = "success" | "warning" | "danger" | "info";

function statusTone(value: string): SemanticTone {
  const normalized = value.toUpperCase();
  if (normalized.includes("ESCALAT") || normalized.includes("REWORK")) return "danger";
  if (normalized.includes("DUE") || normalized.includes("PENDING") || normalized.includes("CONFLICT")) return "warning";
  if (normalized.includes("CLOSED") || normalized.includes("COMPLETE") || normalized.includes("VALIDATED") || normalized.includes("FULFILLED")) return "success";
  return "info";
}

export function sentenceCase(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}

export function relativeDate(value: string | Date): string {
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PrimaryButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`cv-primary-button ${className}`.trim()} {...props}>{children}</button>;
}

export function ActionButton({ children, href, onClick, expanded, className = "" }: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  expanded?: boolean;
  className?: string;
}) {
  const content = <>{children}<span aria-hidden="true">→</span></>;
  const classes = `cf-action-button ${className}`.trim();
  return href
    ? <Link className={classes} href={href}>{content}</Link>
    : <button aria-expanded={expanded} className={classes} onClick={onClick} type="button">{content}</button>;
}

export type CitizenIconName = "arrow" | "bell" | "camera" | "check" | "clipboard" | "clock" | "eye" | "eyeOff" | "file" | "location" | "lock" | "logout" | "person" | "refresh" | "send" | "shield";

export function CitizenIcon({ name, size = 20 }: { name: CitizenIconName; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.8 };
  const paths: Record<CitizenIconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    camera: <><path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clipboard: <><rect height="17" rx="2" width="14" x="5" y="4" /><path d="M9 4V2h6v2M9 9h6M9 13h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-2.2 2.9M6.5 6.6C3.6 8.3 2 12 2 12s3.5 6 10 6a9.5 9.5 0 0 0 3-.5" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h4" /></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    lock: <><rect height="11" rx="2" width="16" x="4" y="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 1-2-5" /></>,
    send: <><path d="m3 4 18 8-18 8 4-8z" /><path d="M7 12h14" /></>,
    shield: <><path d="M12 2 4 5v6c0 5.2 3.4 9 8 11 4.6-2 8-5.8 8-11V5z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  };
  return <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size} {...common}>{paths[name]}</svg>;
}

export function CitizenHeroBackdrop() {
  return <svg aria-hidden="true" className="cf-hero-backdrop" preserveAspectRatio="none" viewBox="0 0 1440 420">
    <g className="cf-network-lines"><path d="M0 288 140 222l135 52 160-96 142 88 180-132 160 102 162-82 150 94 151-72" /><path d="M0 335 190 300l147 42 170-90 153 74 176-126 176 105 157-52 171 64 100-40" /><path d="M82 190 228 330M330 190l105 170M582 154l78 203M820 130l95 222M1080 150l80 190M1310 165l-42 180" /></g>
    <g className="cf-network-dots">{["140,222", "275,274", "435,178", "577,266", "717,134", "877,236", "1039,154", "1189,248", "1340,176", "190,300", "507,252", "836,200", "1169,253"].map((point) => { const [cx, cy] = point.split(","); return <circle cx={cx} cy={cy} key={point} r="4" />; })}</g>
    <g className="cf-skyline"><path d="M0 370h90v-56h28v56h36v-91h52v91h45v-48h36v48h70v-108h62v108h48v-73h48v73h76v-134h66v134h56v-86h48v86h64v-112h66v112h72v-68h44v68h64v-130h65v130h57v-84h50v84h78" /></g>
  </svg>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`cv-card ${className}`.trim()}>{children}</section>;
}

export function StatusChip({ label, tone = statusTone(label) }: { label: string; tone?: SemanticTone }) {
  return <span className={`cv-status-chip ${tone}`}>{sentenceCase(label)}</span>;
}

export function TicketCard({ id, category, status, date, title, meta, href, action }: {
  id: string;
  category: string;
  status: string;
  date: string | Date;
  title?: string;
  meta?: string;
  href?: string;
  action?: ReactNode;
}) {
  const content = <>
    <div className="cv-ticket-top"><span className="cv-ticket-id">Ticket {id.slice(0, 8)}</span><StatusChip label={status} /></div>
    {title ? <h2>{title}</h2> : null}
    <p>{category} · {relativeDate(date)}</p>
    {meta ? <small>{meta}</small> : null}
  </>;
  return href ? <article className="cv-ticket-card"><Link className="cv-ticket-link" href={href}>{content}</Link>{action}</article> : <article className="cv-ticket-card">{content}{action}</article>;
}

export function NotificationRow({ icon, message, time, tone, href }: { icon: string; message: string; time: string; tone: SemanticTone; href?: string }) {
  const content = <><span aria-hidden="true" className={`cv-notification-icon ${tone}`}>{icon}</span><span className="cv-notification-copy"><strong>{message}</strong><small>{time}</small></span><span aria-hidden="true" className="cv-notification-arrow">›</span></>;
  return href ? <Link className="cv-notification-row" href={href}>{content}</Link> : <div className="cv-notification-row">{content}</div>;
}

export function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav aria-label="Pagination" className="pagination-controls"><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">Next</button></nav>;
}

export type CategoryTile = { id: string; name: string };
export function CategoryGrid({ categories, selectedId, onSelect }: { categories: CategoryTile[]; selectedId?: string; onSelect: (category: CategoryTile) => void }) {
  return <div aria-label="Issue categories" className="cv-category-grid">{categories.map((category) => <button aria-pressed={category.id === selectedId} className="cv-category-tile" key={category.id} onClick={() => onSelect(category)} type="button"><span aria-hidden="true">{category.name.slice(0, 1)}</span><strong>{category.name}</strong></button>)}</div>;
}

export function ConflictBanner({ children }: { children: ReactNode }) {
  return <aside className="cv-conflict-banner" role="status">{children}</aside>;
}

export function SequencingRecommendationCard({ children }: { children: ReactNode }) {
  return <aside className="cv-sequencing-card">{children}</aside>;
}
