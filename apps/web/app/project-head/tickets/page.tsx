"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CategorySummary, ProjectHeadTicketSummary, TicketState, WardSummary } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
import { TicketCard } from "../../_components/ui";

export default function TicketQueuePage() {
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [filters, setFilters] = useState({ status: "", category: "", ward: "" });
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      apiFetch<{ categories: CategorySummary[] }>("/categories"),
      apiFetch<{ wards: WardSummary[] }>("/wards"),
    ]).then(([categoryResult, wardResult]) => { setCategories(categoryResult.categories); setWards(wardResult.wards); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load filters"));
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    void apiFetch<{ tickets: ProjectHeadTicketSummary[] }>(`/tickets?${query.toString()}`).then((result) => setTickets(result.tickets)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load tickets"));
  }, [filters]);

  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">W-P3 · Validated tickets</p><h1>Agency ticket queue</h1><p>Only tickets assigned to your agency are returned by the API.</p></div><Link className="primary-link" href="/project-head/tickets/new">New agency ticket</Link></header>
      <section className="filter-bar" aria-label="Ticket filters">
        <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All open states</option>{(["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE", "ENGINEER_ASSIGNED"] satisfies TicketState[]).map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label>
        <label>Category<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Ward<select value={filters.ward} onChange={(event) => setFilters({ ...filters, ward: event.target.value })}><option value="">All wards</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="cv-ticket-grid">
        {tickets.map((ticket) => <TicketCard category={ticket.category.name} date={ticket.validatedAt ?? ticket.createdAt} href={`/project-head/tickets/${ticket.id}`} id={ticket.id} key={ticket.id} meta={ticket.ward.name} status={ticket.inspectionDue ? "Inspection due" : ticket.state} title={ticket.title} />)}
        {tickets.length === 0 ? <div className="empty-state"><strong>No tickets match these filters.</strong><span>New validated work will appear here automatically.</span></div> : null}
      </section>
    </>
  );
}
