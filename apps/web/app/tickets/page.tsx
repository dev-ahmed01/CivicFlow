"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { CitizenTicketSummary, CitizenTicketTimelineItem, PaginationMeta } from "@civicos/shared";
import { ActionButton, CitizenHeroBackdrop, CitizenIcon, relativeDate } from "../_components/ui";
import { getCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function citizenFetch<T>(path: string): Promise<T> {
  const accessToken = getCitizenAccessToken();
  const response = await fetch(`${apiUrl}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, cache: "no-store" });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not load tickets");
  return body;
}

async function loadTickets(filter: "ongoing" | "past") {
  return citizenFetch<{ tickets: CitizenTicketSummary[]; pagination: PaginationMeta }>(`/citizens/me/tickets?filter=${filter}&page=1&limit=50`);
}

type TicketDetail = { ticket: CitizenTicketSummary; timeline: CitizenTicketTimelineItem[] };

function statusClass(ticket: CitizenTicketSummary): string {
  if (ticket.status === "CLOSED") return "resolved";
  if (ticket.status === "AWAITING_CONFIRMATION") return "delayed";
  if (ticket.status === "COMMUNITY_REVIEW") return "stalled";
  if (ticket.status === "INSPECTION_AND_PLANNING") return "stopped";
  return "ongoing";
}

function TicketTable({ tickets, past, total, expandedId, details, onToggle }: {
  tickets: CitizenTicketSummary[];
  past: boolean;
  total: number;
  expandedId?: string;
  details: Record<string, TicketDetail | undefined>;
  onToggle: (ticket: CitizenTicketSummary) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tickets : tickets.slice(0, past ? 3 : 4);
  return <section className="cf-ticket-section">
    <header><div className="cf-ticket-heading-icon"><CitizenIcon name={past ? "check" : "clock"} /></div><div><h2>{past ? "Past" : "Ongoing"} ({total})</h2><p>{past ? "Reports that have been resolved or closed." : "Reports that are currently being worked on."}</p></div>{tickets.length > (past ? 3 : 4) ? <button onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Show Less" : "View All"} <span>→</span></button> : null}</header>
    <div className="cf-ticket-table-wrap"><table className="cf-ticket-table"><thead><tr><th>#</th><th>Ticket ID</th><th>Issue</th><th>Status</th><th>{past ? "Resolved On" : "Last Updated"}</th><th>Action</th></tr></thead><tbody>
      {visible.map((ticket, index) => {
        const expanded = expandedId === ticket.id;
        const detail = details[ticket.id];
        return <Fragment key={ticket.id}><tr><td>{index + 1}</td><td><code>CC-{ticket.id.slice(0, 4).toUpperCase()}</code></td><td><span className={`cf-issue-icon issue-${index % 4}`}><CitizenIcon name="file" size={17} /></span>{ticket.category.name}</td><td><span className={`cf-ticket-status ${statusClass(ticket)}`}>{ticket.statusLabel}</span></td><td>{past ? new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : relativeDate(ticket.createdAt)}</td><td><ActionButton expanded={expanded} onClick={() => onToggle(ticket)}>{expanded ? "Close Details" : "View Details"}</ActionButton></td></tr>
          {expanded ? <tr className="cf-detail-row"><td colSpan={6}><div className="cf-ticket-detail"><div><p className="eyebrow">Ticket details</p><h3>{ticket.title}</h3><p><CitizenIcon name="location" size={17} />{ticket.address}</p><small>{ticket.observationCount} community {ticket.observationCount === 1 ? "report" : "reports"}</small></div>{detail ? <ol>{detail.timeline.map((event) => <li key={`${event.status}-${new Date(event.at).toISOString()}`}><span /><div><strong>{event.label}</strong><small>{new Date(event.at).toLocaleString("en-IN")}</small></div></li>)}</ol> : <p>Loading status history…</p>}<Link href={`/tickets/${ticket.id}`}>View full page →</Link></div></td></tr> : null}</Fragment>;
      })}
      {!visible.length ? <tr><td className="cf-table-empty" colSpan={6}>No {past ? "past" : "ongoing"} reports yet.</td></tr> : null}
    </tbody></table></div>
  </section>;
}

export default function CitizenTicketsPage() {
  const [ongoing, setOngoing] = useState<CitizenTicketSummary[]>([]);
  const [past, setPast] = useState<CitizenTicketSummary[]>([]);
  const [totals, setTotals] = useState({ ongoing: 0, past: 0 });
  const [expandedId, setExpandedId] = useState<string>();
  const [details, setDetails] = useState<Record<string, TicketDetail | undefined>>({});
  const loadedDetailIds = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadDetail = useCallback(async (ticket: CitizenTicketSummary) => {
    setExpandedId((current) => current === ticket.id ? undefined : ticket.id);
    if (loadedDetailIds.current.has(ticket.id)) return;
    loadedDetailIds.current.add(ticket.id);
    try {
      const [ticketResult, timelineResult] = await Promise.all([
        citizenFetch<{ ticket: CitizenTicketSummary }>(`/tickets/${ticket.id}`),
        citizenFetch<{ timeline: CitizenTicketTimelineItem[] }>(`/tickets/${ticket.id}/timeline`),
      ]);
      setDetails((current) => ({ ...current, [ticket.id]: { ticket: ticketResult.ticket, timeline: timelineResult.timeline } }));
    } catch (caught) {
      loadedDetailIds.current.delete(ticket.id);
      setError(caught instanceof Error ? caught.message : "Could not load ticket details");
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadTickets("ongoing"), loadTickets("past")]).then(([ongoingResult, pastResult]) => {
      setOngoing(ongoingResult.tickets); setPast(pastResult.tickets);
      setTotals({ ongoing: ongoingResult.pagination.total, past: pastResult.pagination.total });
      const requested = new URLSearchParams(window.location.search).get("ticket");
      const selected = [...ongoingResult.tickets, ...pastResult.tickets].find((ticket) => ticket.id === requested);
      if (selected) void loadDetail(selected);
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load tickets")).finally(() => setLoading(false));
  }, [loadDetail]);

  return <main className="citizen-shell cf-tickets-page">
    <section className="cf-dark-stage cf-tickets-stage"><div className="cf-ticket-hero"><CitizenHeroBackdrop /><div className="cf-hero-inner"><div className="cf-hero-copy"><h1>Track Your Reports<br /><strong>Stay Informed. Stay Ahead.</strong></h1><p>View the status and progress of all your reported issues in one place.</p><div className="cf-feature-list cf-ticket-features"><article><span><CitizenIcon name="refresh" /></span><div><h2>Stay Updated</h2><p>Real-time progress on your reported issues.</p></div></article><article><span><CitizenIcon name="shield" /></span><div><h2>Complete Transparency</h2><p>Track every step from submission to resolution.</p></div></article></div></div><aside className="cf-hero-card"><span className="cf-round-icon"><CitizenIcon name="clipboard" size={34} /></span><h2>Your Voice. Our Priority.</h2><p>Thank you for helping us<br />build a better city.</p><ActionButton href="/">Report an Issue</ActionButton></aside></div></div><div className="cf-hero-curve" aria-hidden="true" /></section>
    <div className="cf-tickets-content">{error ? <p className="error" role="alert">{error}</p> : null}{loading ? <div className="cf-loading-card">Loading your reports…</div> : <><TicketTable details={details} expandedId={expandedId} onToggle={(ticket) => void loadDetail(ticket)} past={false} tickets={ongoing} total={totals.ongoing} /><TicketTable details={details} expandedId={expandedId} onToggle={(ticket) => void loadDetail(ticket)} past tickets={past} total={totals.past} /></>}</div>
  </main>;
}
