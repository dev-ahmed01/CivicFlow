"use client";

import { useCallback, useEffect, useState } from "react";
import type { CitizenTicketSummary } from "@civicos/shared";
import { TicketCard } from "../_components/ui";
import { getCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function loadTickets(filter: "ongoing" | "past") {
  const accessToken = getCitizenAccessToken();
  const response = await fetch(`${apiUrl}/citizens/me/tickets?filter=${filter}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, cache: "no-store" });
  const body = await response.json() as { tickets?: CitizenTicketSummary[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Could not load tickets");
  return body.tickets ?? [];
}

export default function CitizenTicketsPage() {
  const [filter, setFilter] = useState<"ongoing" | "past">("ongoing");
  const [tickets, setTickets] = useState<CitizenTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setTickets(await loadTickets(filter)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load tickets"); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <main className="citizen-page"><header className="citizen-page-heading"><p className="eyebrow">Your reports</p><h1>My tickets</h1><p>Follow active work or revisit completed reports.</p></header><div aria-label="Ticket filters" className="notification-filters" role="tablist"><button aria-selected={filter === "ongoing"} className={filter === "ongoing" ? "active" : ""} onClick={() => setFilter("ongoing")} role="tab" type="button">Ongoing</button><button aria-selected={filter === "past"} className={filter === "past" ? "active" : ""} onClick={() => setFilter("past")} role="tab" type="button">Past</button></div>{error ? <p className="error" role="alert">{error}</p> : null}{loading ? <p>Loading tickets…</p> : null}<section className="cv-ticket-grid">{tickets.map((ticket) => <TicketCard category={ticket.category.name} date={ticket.createdAt} href={`/tickets/${ticket.id}`} id={ticket.id} key={ticket.id} meta={ticket.address} status={ticket.statusLabel} title={ticket.title} />)}{!loading && tickets.length === 0 ? <div className="empty-state"><strong>No {filter} tickets yet.</strong></div> : null}</section></main>;
}
