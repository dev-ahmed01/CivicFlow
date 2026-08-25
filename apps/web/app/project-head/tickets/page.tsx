"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CategorySummary, PaginationMeta, ProjectHeadTicketSummary, TicketState, WardSummary } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
import { PaginationControls, TicketCard } from "../../_components/ui";

export default function TicketQueuePage() {
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [filters, setFilters] = useState({ status: "", category: "", ward: "" });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      apiFetch<{ categories: CategorySummary[] }>("/categories"),
      apiFetch<{ wards: WardSummary[] }>("/wards"),
    ]).then(([categoryResult, wardResult]) => { setCategories(categoryResult.categories); setWards(wardResult.wards); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load filters"));
  }, []);
  useEffect(() => {
    const query = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value), ["page", String(page)], ["limit", "20"]]);
    void apiFetch<{ tickets: ProjectHeadTicketSummary[]; pagination: PaginationMeta }>(`/tickets?${query.toString()}`).then((result) => { setTickets(result.tickets); setPagination(result.pagination); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load tickets"));
  }, [filters, page]);

  const changeFilters = (next: typeof filters) => { setFilters(next); setPage(1); };

  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">W-P3 · Validated tickets</p><h1>Agency ticket queue</h1><p>Only tickets assigned to your agency are returned by the API.</p></div><Link className="primary-link" href="/project-head/tickets/new">New agency ticket</Link></header>
      <section className="filter-bar" aria-label="Ticket filters">
        <label>Status<select value={filters.status} onChange={(event) => changeFilters({ ...filters, status: event.target.value })}><option value="">All open states</option>{(["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE", "ENGINEER_ASSIGNED"] satisfies TicketState[]).map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label>
        <label>Category<select value={filters.category} onChange={(event) => changeFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Ward<select value={filters.ward} onChange={(event) => changeFilters({ ...filters, ward: event.target.value })}><option value="">All wards</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="cv-ticket-grid">
        {tickets.map((ticket) => <TicketCard category={ticket.category.name} date={ticket.validatedAt ?? ticket.createdAt} href={`/project-head/tickets/${ticket.id}`} id={ticket.id} key={ticket.id} meta={ticket.ward.name} status={ticket.inspectionDue ? "Inspection due" : ticket.state} title={ticket.title} />)}
        {tickets.length === 0 ? <div className="empty-state"><strong>No tickets match these filters.</strong><span>New validated work will appear here automatically.</span></div> : null}
      </section>
      <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
    </>
  );
}
