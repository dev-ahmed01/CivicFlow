"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { CategorySummary, PaginationMeta, ProjectHeadTicketSummary, TicketState, WardSummary } from "@civicos/shared";
import { ActionButton, PaginationControls, PortalStatePill, relativeDate } from "../../_components/ui";
import { NextActionButton } from "../../_components/operations";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { TicketDetailClient } from "./[id]/ticket-detail-client";
import AgencyTicketPage from "./new/page";

function deadlineText(deadline: string | Date): string {
  const difference = new Date(deadline).getTime() - Date.now();
  const days = Math.max(1, Math.ceil(Math.abs(difference) / 86_400_000));
  return difference >= 0 ? `${days} ${days === 1 ? "day" : "days"} left` : `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
}

export default function TicketQueuePage() {
  const [tickets, setTickets] = useState<ProjectHeadTicketSummary[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [filters, setFilters] = useState({ status: "", category: "", ward: "" });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [error, setError] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    void Promise.all([apiFetch<{ categories: CategorySummary[] }>("/categories"), apiFetch<{ wards: WardSummary[] }>("/wards")])
      .then(([categoryResult, wardResult]) => { setCategories(categoryResult.categories); setWards(wardResult.wards); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load filters"));
  }, []);

  const load = useCallback(async () => {
    const query = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value), ["page", String(page)], ["limit", "20"]]);
    try {
      const result = await apiFetch<{ tickets: ProjectHeadTicketSummary[]; pagination: PaginationMeta }>(`/tickets?${query.toString()}`);
      setTickets(result.tickets);
      setPagination(result.pagination);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load tickets");
    }
  }, [filters, page]);
  usePortalPolling(load);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedTicket = query.get("ticket");
    const requestedStatus = query.get("status");
    if (requestedTicket) setExpandedId(requestedTicket);
    if (requestedStatus) setFilters((current) => ({ ...current, status: requestedStatus }));
  }, []);

  const changeFilters = (next: typeof filters) => { setFilters(next); setPage(1); };

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Validated tickets</p><h1>Agency ticket queue</h1><p>Review, inspect, and progress tickets assigned to your agency.</p></div><button aria-expanded={createOpen} className="portal-primary-button" onClick={() => setCreateOpen((open) => !open)} type="button">{createOpen ? "Close ticket form" : "New agency ticket"}</button></header>
    {createOpen ? <section aria-label="Create agency ticket" className="portal-inline-drawer"><AgencyTicketPage /></section> : null}
    <section aria-label="Ticket filters" className="filter-bar">
      <label>Status<select value={filters.status} onChange={(event) => changeFilters({ ...filters, status: event.target.value })}><option value="">All open states</option>{(["ROUTED_TO_AGENCY", "INSPECTION_DUE", "INSPECTION_COMPLETE", "PROJECT_CREATED", "ENGINEER_ASSIGNED", "WORK_IN_PROGRESS", "WORK_COMPLETED", "AWAITING_CITIZEN_VERIFICATION"] satisfies TicketState[]).map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}</select></label>
      <label>Category<select value={filters.category} onChange={(event) => changeFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>Ward<select value={filters.ward} onChange={(event) => changeFilters({ ...filters, ward: event.target.value })}><option value="">All wards</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card portal-work-table"><div className="table-scroll"><table><thead><tr><th>Ticket</th><th>Issue</th><th>Status</th><th>Responsible</th><th>Deadline</th><th>Indicators</th><th>Action</th></tr></thead><tbody>{tickets.map((ticket) => {
      const expanded = expandedId === ticket.id;
      const inspectable = ticket.state === "ROUTED_TO_AGENCY" || ticket.state === "INSPECTION_DUE";
      const projectReady = ticket.state === "INSPECTION_COMPLETE" || ticket.state === "PROJECT_CREATED";
      return <Fragment key={ticket.id}><tr className={expanded ? "expanded" : ""}><td><code>{ticket.referenceNumber}</code></td><td><strong>{ticket.title}</strong><small>{ticket.category.name} · {ticket.ward.name} · {relativeDate(ticket.validatedAt ?? ticket.createdAt)}</small></td><td><PortalStatePill state={ticket.inspectionDue ? "INSPECTION_DUE" : ticket.state} /></td><td>{ticket.action?.responsibleUser.email ?? "Agency queue"}<small>{ticket.assignedAgency?.name ?? "Unassigned"}</small></td><td className={ticket.action && new Date(ticket.action.deadline).getTime() < Date.now() ? "deadline-overdue" : ""}>{ticket.action ? deadlineText(ticket.action.deadline) : "No pending response"}</td><td>{ticket.grievance ? <strong className="grievance-indicator">Grievance · {ticket.grievance.status.replaceAll("_", " ")}</strong> : "No grievance"}</td><td><div className="portal-row-actions">{inspectable ? <NextActionButton onClick={() => setExpandedId(ticket.id)}>Inspect</NextActionButton> : null}{projectReady ? <NextActionButton href={`/project-head/projects?ticketId=${ticket.id}`}>{ticket.state === "PROJECT_CREATED" ? "Assign Engineer" : "Create Project"}</NextActionButton> : null}{ticket.grievance ? <NextActionButton href={`/project-head/grievances?grievance=${ticket.grievance.id}`}>Review Grievance</NextActionButton> : null}<ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : ticket.id)}>{expanded ? "Close" : "View"}</ActionButton></div></td></tr>{expanded ? <tr className="portal-inline-row"><td colSpan={7}><div className="portal-reveal"><TicketDetailClient ticketId={ticket.id} /><div className="portal-deep-link"><ActionButton href={`/project-head/tickets/${ticket.id}`}>Open full page</ActionButton></div></div></td></tr> : null}</Fragment>;
    })}</tbody></table></div>{tickets.length === 0 ? <div className="empty-state"><strong>No tickets match these filters.</strong><span>New validated work will appear here automatically.</span></div> : null}</section>
    {expandedId && !tickets.some((ticket) => ticket.id === expandedId) ? <section className="portal-detached-reveal"><TicketDetailClient ticketId={expandedId} /><ActionButton onClick={() => setExpandedId(undefined)}>Close</ActionButton></section> : null}
    <PaginationControls page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
  </>;
}
