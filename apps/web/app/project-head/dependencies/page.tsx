"use client";

import type { CoordinationRequest, CoordinationStatus } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useState } from "react";
import { EmptyState, PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

const statuses: CoordinationStatus[] = ["SENT", "ACKNOWLEDGED", "CLARIFICATION_REQUESTED", "INSPECTION_REQUIRED", "ENGINEER_ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "REJECTED"];
const label = (value: string) => value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());

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
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load coordination requests"); }
  }, [direction, status]);
  usePortalPolling(load);

  return <>
    <PageHeader eyebrow="Inter-agency operations" title="Coordination" description="Structured work requests, decisions, evidence, and assignments." />
    <div aria-label="Coordination views" className="portal-tabs" role="tablist"><button aria-selected={direction === "received"} onClick={() => setDirection("received")} role="tab" type="button">Received</button><button aria-selected={direction === "sent"} onClick={() => setDirection("sent")} role="tab" type="button">Sent by us</button></div>
    <section className="filter-bar compact-filter"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All active and closed</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card coordination-table" aria-live="polite"><div className="table-scroll"><table><thead><tr><th>Request</th><th>Partner agency</th><th>Related work</th><th>Status</th><th>Response due</th><th>Assigned</th><th>Action</th></tr></thead><tbody>{requests.map((item) => {
      const partner = direction === "received" ? item.requestingAgency : item.respondingAgency;
      return <tr key={item.id}><td><strong>{item.subject}</strong><small>{label(item.requestTypeKey)}</small></td><td>{partner.name}</td><td><strong>{item.project.title}</strong><small>{item.project.locationLabel ?? item.project.ticket?.address ?? item.project.ward?.name ?? "Location not recorded"}</small></td><td><PortalStatePill state={item.status} /></td><td>{new Date(item.responseDeadline).toLocaleString("en-IN")}</td><td>{item.assignedEngineer?.email ?? "Not assigned"}</td><td><Link className="table-action" href={`/project-head/coordination/${item.id}`}>Open record</Link></td></tr>;
    })}</tbody></table></div>{requests.length === 0 ? <EmptyState title="No coordination requests in this view" description="Start a request from a civic work record when another agency’s input is required." /> : null}</section>
  </>;
}
