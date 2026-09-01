"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { InspectionDetail } from "@civicos/shared";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

const states = ["ALL", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "SUBMITTED"] as const;

function dateLabel(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function EngineerInspectionsPage() {
  const [items, setItems] = useState<InspectionDetail[]>([]);
  const [filter, setFilter] = useState<(typeof states)[number]>("ALL");
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ inspections: InspectionDetail[] }>("/inspections");
      setItems(result.inspections);
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load inspections"); }
  }, []);
  usePortalPolling(load);
  const visible = useMemo(() => items.filter((item) => filter === "ALL" || item.status === filter), [filter, items]);

  return <div className="field-module">
    <header className="portal-heading"><div><p className="eyebrow">Field assessment</p><h1>Inspections</h1><p>Confirm the issue on site, capture structured evidence, and return a recommendation to your Project Head.</p></div></header>
    <div className="engineer-work-tabs" role="tablist" aria-label="Inspection states">{states.map((state) => <button aria-selected={filter === state} className={filter === state ? "active" : ""} key={state} onClick={() => setFilter(state)} role="tab" type="button">{state === "ALL" ? "All" : state.replaceAll("_", " ")}</button>)}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="field-record-list" aria-live="polite">{visible.map((inspection) => <Link className="field-record-row" href={`/engineer/inspections/${inspection.id}`} key={inspection.id}>
      <span className={`field-state state-${inspection.status.toLowerCase()}`}>{inspection.status.replaceAll("_", " ")}</span>
      <span><strong>{inspection.ticket.title}</strong><small>{inspection.ticket.referenceNumber} · {inspection.ticket.category.name}</small></span>
      <span><strong>{inspection.ticket.ward.name}</strong><small>{inspection.ticket.address}</small></span>
      <span><small>Deadline</small><strong>{dateLabel(inspection.deadline)}</strong></span>
      <b aria-hidden="true">→</b>
    </Link>)}{visible.length === 0 ? <div className="empty-state"><strong>No inspections in this state.</strong><span>Assignments from your agency appear here automatically.</span></div> : null}</section>
  </div>;
}
