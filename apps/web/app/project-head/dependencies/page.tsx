"use client";

import type { CoordinationRequest, CoordinationStatus } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useState } from "react";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

const statuses: CoordinationStatus[] = ["SENT", "ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "INSPECTION_REQUIRED", "ENGINEER_ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "REJECTED"];

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

export default function ProjectHeadDependenciesPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [status, setStatus] = useState("");
  const [requests, setRequests] = useState<CoordinationRequest[]>([]);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const query = new URLSearchParams({ direction });
    if (status) query.set("status", status);
    try {
      setRequests((await apiFetch<{ requests: CoordinationRequest[] }>(`/coordination-requests?${query.toString()}`)).requests);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load coordination requests");
    }
  }, [direction, status]);
  usePortalPolling(load);

  return <div className="coordination-index-page">
    <header className="portal-heading"><div><p className="eyebrow">Inter-agency operations</p><h1>Coordination workspace</h1><p>Structured requests, evidence, decisions, and assignments linked to civic work.</p></div></header>
    <div aria-label="Coordination views" className="engineer-work-tabs" role="tablist"><button aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => setDirection("received")} role="tab" type="button">Received requests</button><button aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => setDirection("sent")} role="tab" type="button">Requested by us</button></div>
    <section className="filter-bar coordination-filter"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All active and closed</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" className="coordination-request-list">{requests.map((item) => {
      const partner = direction === "received" ? item.requestingAgency : item.respondingAgency;
      return <article className="coordination-request-card" key={item.id}>
        <div className="coordination-request-main"><div className="coordination-card-kicker"><span>{label(item.requestTypeKey)}</span><span className={`coordination-status status-${item.status.toLowerCase()}`}>{label(item.status)}</span></div><h2>{item.subject}</h2><p>{item.details}</p><dl><div><dt>{direction === "received" ? "Requesting agency" : "Receiving agency"}</dt><dd>{partner.name}</dd></div><div><dt>Related work</dt><dd>{item.project.referenceNumber} · {item.project.title}</dd></div><div><dt>Location</dt><dd>{item.project.locationLabel ?? item.project.ticket?.address ?? item.project.ward?.name ?? "Not recorded"}</dd></div></dl></div>
        <aside><div><span>Response due</span><strong>{new Date(item.responseDeadline).toLocaleString("en-IN")}</strong></div><div><span>Assigned</span><strong>{item.assignedEngineer?.email ?? "Not assigned"}</strong></div><div><span>Activity</span><strong>{item.entries.length} entries</strong></div><Link className="portal-primary-button" href={`/project-head/coordination/${item.id}`}>Open work record</Link></aside>
      </article>;
    })}{requests.length === 0 ? <div className="empty-state"><strong>No coordination requests in this view.</strong><span>Start one from a civic work record using “Coordinate with agency”.</span></div> : null}</section>
  </div>;
}
