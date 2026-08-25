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
