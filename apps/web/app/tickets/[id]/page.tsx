"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CitizenTicketSummary } from "@civicos/shared";
import { Card, StatusChip } from "../../_components/ui";
import { citizenApiFetch } from "../../_lib/citizen-auth";

export default function CitizenTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<CitizenTicketSummary>();
  const [error, setError] = useState<string>();
  useEffect(() => { void citizenApiFetch<{ ticket: CitizenTicketSummary }>(`/tickets/${params.id}`).then(({ ticket }) => setTicket(ticket)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load ticket")); }, [params.id]);
  return <main className="citizen-shell citizen-page">{error ? <p className="error" role="alert">{error}</p> : null}{ticket ? <><header className="citizen-page-heading"><p className="eyebrow">Ticket {ticket.referenceNumber}</p><h1>{ticket.title}</h1><StatusChip label={ticket.statusLabel} /></header><Card><h2>{ticket.category.name}</h2><p>{ticket.address}</p><small>Reported {new Date(ticket.createdAt).toLocaleDateString("en-IN")}</small><p>{ticket.observationCount} community {ticket.observationCount === 1 ? "report" : "reports"}</p></Card></> : !error ? <p>Loading ticket…</p> : null}</main>;
}
