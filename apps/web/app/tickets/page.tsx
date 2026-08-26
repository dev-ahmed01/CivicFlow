"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CitizenTicketSummary, CitizenTicketTimelineResponse, PaginationMeta } from "@civicos/shared";
import { ActionButton, CitizenHeroBackdrop, CitizenIcon, relativeDate } from "../_components/ui";
import { citizenApiFetch } from "../_lib/citizen-auth";
import { TicketDetailDialog } from "./_components/ticket-detail-dialog";

async function citizenFetch<T>(path: string): Promise<T> {
  return citizenApiFetch<T>(path);
}

async function loadTickets(filter: "ongoing" | "past") {
  return citizenFetch<{ tickets: CitizenTicketSummary[]; pagination: PaginationMeta }>(`/citizens/me/tickets?filter=${filter}&page=1&limit=50`);
}

type TicketDetail = CitizenTicketTimelineResponse & { ticket: CitizenTicketSummary };

function statusClass(ticket: CitizenTicketSummary): string {
  if (ticket.status === "CLOSED") return "resolved";
  if (ticket.status === "AWAITING_CONFIRMATION") return "delayed";
  if (ticket.status === "COMMUNITY_REVIEW") return "stalled";
  if (ticket.status === "INSPECTION_AND_PLANNING") return "stopped";
  return "ongoing";
}

function TicketTable({ tickets, past, total, onView }: {
  tickets: CitizenTicketSummary[];
  past: boolean;
  total: number;
  onView: (ticket: CitizenTicketSummary) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tickets : tickets.slice(0, past ? 3 : 4);
  return <section className="cf-ticket-section">
    <header><div className="cf-ticket-heading-icon"><CitizenIcon name={past ? "check" : "clock"} /></div><div><h2>{past ? "Past" : "Ongoing"} ({total})</h2><p>{past ? "Reports that have been resolved or closed." : "Reports that are currently being worked on."}</p></div>{tickets.length > (past ? 3 : 4) ? <button onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Show Less" : "View All"} <span>→</span></button> : null}</header>
    <div className="cf-ticket-table-wrap"><table className="cf-ticket-table"><thead><tr><th>#</th><th>Ticket ID</th><th>Issue</th><th>Status</th><th>{past ? "Resolved On" : "Last Updated"}</th><th>Action</th></tr></thead><tbody>
      {visible.map((ticket, index) => <tr key={ticket.id}><td>{index + 1}</td><td><code>{ticket.referenceNumber}</code></td><td><span className={`cf-issue-icon issue-${index % 4}`}><CitizenIcon name="file" size={17} /></span>{ticket.category.name}</td><td><span className={`cf-ticket-status ${statusClass(ticket)}`}>{ticket.statusLabel}</span></td><td>{past ? new Date(ticket.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : relativeDate(ticket.updatedAt)}</td><td><ActionButton onClick={() => onView(ticket)}>View Details</ActionButton></td></tr>)}
      {!visible.length ? <tr><td className="cf-table-empty" colSpan={6}>No {past ? "past" : "ongoing"} reports yet.</td></tr> : null}
    </tbody></table></div>
  </section>;
}

export default function CitizenTicketsPage() {
  const [ongoing, setOngoing] = useState<CitizenTicketSummary[]>([]);
  const [past, setPast] = useState<CitizenTicketSummary[]>([]);
  const [totals, setTotals] = useState({ ongoing: 0, past: 0 });
  const [selectedTicket, setSelectedTicket] = useState<CitizenTicketSummary>();
  const [details, setDetails] = useState<Record<string, TicketDetail | undefined>>({});
  const loadedDetailIds = useRef(new Set<string>());
  const [detailLoadingId, setDetailLoadingId] = useState<string>();
  const [detailError, setDetailError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const openDetail = useCallback(async (ticket: CitizenTicketSummary) => {
    setSelectedTicket(ticket);
    setDetailError(undefined);
    if (loadedDetailIds.current.has(ticket.id)) return;
    loadedDetailIds.current.add(ticket.id);
    setDetailLoadingId(ticket.id);
    try {
      const [ticketResult, timelineResult] = await Promise.all([
        citizenFetch<{ ticket: CitizenTicketSummary }>(`/tickets/${ticket.id}`),
        citizenFetch<CitizenTicketTimelineResponse>(`/tickets/${ticket.id}/timeline`),
      ]);
      setDetails((current) => ({ ...current, [ticket.id]: { ticket: ticketResult.ticket, ...timelineResult } }));
    } catch (caught) {
      loadedDetailIds.current.delete(ticket.id);
      setDetailError(caught instanceof Error ? caught.message : "Could not load ticket details");
    } finally {
      setDetailLoadingId(undefined);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadTickets("ongoing"), loadTickets("past")]).then(([ongoingResult, pastResult]) => {
      setOngoing(ongoingResult.tickets);
      setPast(pastResult.tickets);
      setTotals({ ongoing: ongoingResult.pagination.total, past: pastResult.pagination.total });
      const requested = new URLSearchParams(window.location.search).get("ticket");
      const selected = [...ongoingResult.tickets, ...pastResult.tickets].find((ticket) => ticket.id === requested);
      if (selected) void openDetail(selected);
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load tickets")).finally(() => setLoading(false));
  }, [openDetail]);

  const selectedDetail = selectedTicket ? details[selectedTicket.id] : undefined;
  return <main className="citizen-shell cf-tickets-page">
    <section className="cf-dark-stage cf-tickets-stage"><div className="cf-ticket-hero"><CitizenHeroBackdrop /><div className="cf-hero-inner"><div className="cf-hero-copy"><h1>Track Your Reports<br /><strong>Stay Informed. Stay Ahead.</strong></h1><p>View the status and progress of all your reported issues in one place.</p><div className="cf-feature-list cf-ticket-features"><article><span><CitizenIcon name="refresh" /></span><div><h2>Stay Updated</h2><p>Real-time progress on your reported issues.</p></div></article><article><span><CitizenIcon name="shield" /></span><div><h2>Complete Transparency</h2><p>Track every step from submission to resolution.</p></div></article></div></div><aside className="cf-hero-card"><span className="cf-round-icon"><CitizenIcon name="clipboard" size={34} /></span><h2>Your Voice. Our Priority.</h2><p>Thank you for helping us<br />build a better city.</p><ActionButton href="/">Report an Issue</ActionButton></aside></div></div><div className="cf-hero-curve" aria-hidden="true" /></section>
    <div className="cf-tickets-content">{error ? <p className="error" role="alert">{error}</p> : null}{loading ? <div className="cf-loading-card">Loading your reports…</div> : <><TicketTable onView={(ticket) => void openDetail(ticket)} past={false} tickets={ongoing} total={totals.ongoing} /><TicketTable onView={(ticket) => void openDetail(ticket)} past tickets={past} total={totals.past} /></>}</div>
    {selectedTicket ? <TicketDetailDialog error={detailError} loading={detailLoadingId === selectedTicket.id} notes={selectedDetail?.notes} onClose={() => setSelectedTicket(undefined)} ticket={selectedDetail?.ticket ?? selectedTicket} timeline={selectedDetail?.timeline} /> : null}
  </main>;
}
