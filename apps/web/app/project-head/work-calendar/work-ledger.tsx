"use client";

import React from "react";
import type { CivicWorkLedgerItem, CivicWorkLedgerLocation, PaginationMeta } from "@civicos/shared";
import { PaginationControls } from "../../_components/ui";

type LedgerResponse = { location: CivicWorkLedgerLocation; works: CivicWorkLedgerItem[]; pagination: PaginationMeta };

function dates(work: CivicWorkLedgerItem): string {
  if (!work.plannedStart || !work.plannedEnd) return "Timeline pending";
  return `${new Date(work.plannedStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(work.plannedEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function WorkLedger({ ledger, loading, wardSelected, roadSelected, page, onPageChange }: {
  ledger?: LedgerResponse;
  loading: boolean;
  wardSelected: boolean;
  roadSelected: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (!wardSelected && !roadSelected) return <section className="work-ledger-empty"><span aria-hidden="true">⌖</span><h2>Choose a road or ward</h2><p>The work ledger is a permanent place history. Select a road for exact corridor history, or a ward for its area ledger.</p></section>;
  if (loading && !ledger) return <p className="work-calendar-progress" role="status">Opening the permanent location history…</p>;
  if (!ledger) return null;
  return <section className="work-ledger">
    <header className="work-ledger-heading"><div><p className="eyebrow">{ledger.location.kind === "ROAD" ? "Road work ledger" : "Area work ledger"}</p><h2>{ledger.location.name}</h2><p>{ledger.location.kind === "ROAD" ? `${ledger.location.ward.name}${ledger.location.surfaceType ? ` · ${ledger.location.surfaceType}` : ""}` : "Ordered civic-work history across this ward"}</p></div><div><strong>{ledger.pagination.total}</strong><span>permanent records</span></div></header>
    {ledger.works.length > 0 ? <div className="work-ledger-list">{ledger.works.map((work) => <article className="work-ledger-record" key={work.id}>
      <div className="work-ledger-summary"><span data-period={work.period.toLowerCase()}>{work.period === "CURRENT" ? "Happening now" : work.period === "FUTURE" ? "Upcoming" : "Past"}</span><div><h3>{work.title}</h3><p>{work.agency.name} · {work.locationLabel ?? work.roadSegment?.roadName ?? work.ward?.name}</p></div><div><strong>{dates(work)}</strong><small>{work.state.replaceAll("_", " ").toLowerCase()}</small></div></div>
      <div className="work-ledger-facts"><span>{work.evidenceCount > 0 ? `${work.evidenceCount} evidence item${work.evidenceCount === 1 ? "" : "s"}` : "No evidence attached"}</span><span>{work.dependencySummary.total} dependencies</span><span>{work.conflictCount + work.roadConflictCount} coordination warnings</span></div>
      {work.events.length > 0 ? <ol className="work-ledger-events">{work.events.slice(0, 8).map((event) => <li key={event.id}><time dateTime={String(event.at)}>{new Date(event.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time><span data-kind={event.kind.toLowerCase()}>{event.kind.toLowerCase()}</span><div><strong>{event.title}</strong>{event.detail ? <p>{event.detail}</p> : null}</div>{event.agency ? <small>{event.agency.name}</small> : null}</li>)}</ol> : <p className="work-ledger-no-events">No coordination events have been recorded yet.</p>}
    </article>)}</div> : <div className="work-calendar-empty"><strong>No permanent work records found.</strong><span>This location has no registered civic work yet.</span></div>}
    <PaginationControls onPageChange={onPageChange} page={page} totalPages={ledger.pagination.totalPages} />
  </section>;
}
