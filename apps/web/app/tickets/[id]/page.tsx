"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { CitizenTicketSummary } from "@civicos/shared";
import { Card, StatusChip } from "../../_components/ui";
import { getCitizenAccessToken } from "../../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function CitizenTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<CitizenTicketSummary>();
  const [error, setError] = useState<string>();
  useEffect(() => { const accessToken = getCitizenAccessToken(); void fetch(`${apiUrl}/tickets/${params.id}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, cache: "no-store" }).then(async (response) => { const body = await response.json() as CitizenTicketSummary & { error?: string }; if (!response.ok) throw new Error(body.error ?? "Could not load ticket"); setTicket(body); }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load ticket")); }, [params.id]);
  return <main className="citizen-page">{error ? <p className="error" role="alert">{error}</p> : null}{ticket ? <><header className="citizen-page-heading"><p className="eyebrow">Ticket {ticket.id.slice(0, 8)}</p><h1>{ticket.title}</h1><StatusChip label={ticket.statusLabel} /></header><Card><h2>{ticket.category.name}</h2><p>{ticket.address}</p><small>Reported {new Date(ticket.createdAt).toLocaleDateString("en-IN")}</small><p>{ticket.observationCount} community {ticket.observationCount === 1 ? "report" : "reports"}</p></Card></> : !error ? <p>Loading ticket…</p> : null}</main>;
}
