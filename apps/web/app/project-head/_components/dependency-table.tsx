"use client";

import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyState, EngineerSummary } from "@civicos/shared";
import { ActionButton, PortalStatePill } from "../../_components/ui";
import { apiFetch } from "../_lib/api";

const statuses: DependencyState[] = ["PENDING_RESPONSE", "ASSIGNED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED", "ESCALATED", "FULFILLED"];
function countdown(deadline: Date, now: number): string {
  const remaining = new Date(deadline).getTime() - now;
  if (remaining <= 0) return "Response overdue";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

function outboxLabel(state: DependencyState): "Pending" | "Responded" | "Escalated" {
  if (state === "PENDING_RESPONSE" || state === "REQUESTED") return "Pending";
  if (state === "ESCALATED") return "Escalated";
  return "Responded";
}

export function DependencyTable({ direction }: { direction: "sent" | "received" }) {
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [status, setStatus] = useState("");
  const [engineerIds, setEngineerIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [responseExpandedId, setResponseExpandedId] = useState<string>();
  const [detailExpandedId, setDetailExpandedId] = useState<string>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => {
    const query = new URLSearchParams({ direction });
    if (status) query.set("status", status);
    return apiFetch<{ dependencies: DependencyListItem[] }>(`/dependencies?${query.toString()}`).then((result) => setDependencies(result.dependencies));
  }, [direction, status]);

  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dependencies")); }, [load]);
  useEffect(() => {
    if (direction !== "received") return;
    void apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers").then((result) => setEngineers(result.engineers)).catch((reason: unknown) => {
      setEngineers([]);
      setError(reason instanceof Error ? reason.message : "Could not load the engineer list");
    });
  }, [direction]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const respond = async (dependencyId: string, action: string, engineerId?: string) => {
    setBusyId(dependencyId);
    setError(undefined);
    try {
      await apiFetch(`/dependencies/${dependencyId}/respond`, { method: "POST", body: JSON.stringify({ action, ...(engineerId ? { engineerId } : {}) }) });
      await load();
      setResponseExpandedId(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update dependency");
    } finally {
      setBusyId(undefined);
    }
  };

  return <>
    <section className="filter-bar dependency-filter"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="dependency-list">{dependencies.map((dependency) => {
      const otherAgency = direction === "received" ? dependency.requestingAgency : dependency.respondingAgency;
      const pending = dependency.state === "PENDING_RESPONSE";
      const requiresResponse = direction === "received" && pending;
      const actionable = requiresResponse || direction === "sent" && (dependency.state === "DECLINED_UNAVAILABLE" || dependency.state === "ESCALATED");
      const responseExpanded = responseExpandedId === dependency.id;
      const detailExpanded = detailExpandedId === dependency.id;
      const showDetails = pending || actionable || detailExpanded;
      return <article className={`dependency-row ${pending ? "priority-row" : ""} ${showDetails ? "" : "compact"}`.trim()} key={dependency.id}>
        <div className="dependency-main"><div className="dependency-top"><PortalStatePill state={direction === "sent" ? outboxLabel(dependency.state) : dependency.state} />{requiresResponse ? <strong className="response-flag">Response required</strong> : null}</div><h2>{dependency.project.ticket?.title ?? "Agency coordination"}</h2>{showDetails ? <><p>{dependency.requirement}</p><dl><div><dt>{direction === "received" ? "Requested by" : "Sent to"}</dt><dd>{otherAgency.name}</dd></div><div><dt>Deadline</dt><dd>{new Date(dependency.deadline).toLocaleString("en-IN")}</dd></div><div><dt>Countdown</dt><dd className={pending ? "countdown" : ""}>{pending ? countdown(dependency.deadline, now) : "Response recorded"}</dd></div>{dependency.assignedEngineer ? <div><dt>Assigned engineer</dt><dd>{dependency.assignedEngineer.email}</dd></div> : null}</dl>{direction === "sent" && pending ? <p className="dependency-waiting-note">Waiting for {otherAgency.name} to choose an engineer.</p> : null}{dependency.contacts.length > 0 ? <div className="escalation-contact"><strong>Escalation contact</strong>{dependency.contacts.map((contact) => <a href={`mailto:${contact.email}`} key={contact.email}>{contact.email}</a>)}</div> : null}</> : <p className="dependency-compact-meta">{direction === "received" ? "Requested by" : "Sent to"} {otherAgency.name}{dependency.assignedEngineer ? ` · Assigned to ${dependency.assignedEngineer.email}` : ""}</p>}</div>
        <div className="dependency-actions">
          {!pending && !actionable ? <ActionButton expanded={detailExpanded} onClick={() => setDetailExpandedId(detailExpanded ? undefined : dependency.id)}>{detailExpanded ? "Hide details" : "View details"}</ActionButton> : null}
          {direction === "received" && pending ? <><ActionButton expanded={responseExpanded} onClick={() => setResponseExpandedId(responseExpanded ? undefined : dependency.id)}>{responseExpanded ? "Close" : "Assign engineer"}</ActionButton>{responseExpanded ? <div className="dependency-response-reveal"><div><strong>Assign this request</strong><p>Choose an engineer from your agency. It will appear in their portal.</p></div><label>Engineer<select aria-label={`Engineer for ${dependency.id}`} value={engineerIds[dependency.id] ?? ""} onChange={(event) => setEngineerIds({ ...engineerIds, [dependency.id]: event.target.value })}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label>{engineers.length === 0 ? <p className="portal-muted">No engineers are available in your agency roster.</p> : null}<button className="portal-primary-button" disabled={busyId === dependency.id || !engineerIds[dependency.id]} type="button" onClick={() => void respond(dependency.id, "ASSIGN_ENGINEER", engineerIds[dependency.id])}>{busyId === dependency.id ? "Assigning…" : "Assign task"}</button><div className="dependency-decline-actions"><span>Can’t take this request?</span><button className="secondary" disabled={busyId === dependency.id} type="button" onClick={() => void respond(dependency.id, "DECLINE_UNAVAILABLE")}>Unavailable</button><button className="secondary" disabled={busyId === dependency.id} type="button" onClick={() => void respond(dependency.id, "DECLINE_NOT_CONCERNED")}>Not our scope</button></div></div> : null}</> : null}
          {direction === "sent" && dependency.state === "DECLINED_UNAVAILABLE" ? <ActionButton onClick={() => void respond(dependency.id, "RESEND")}>Re-send request</ActionButton> : null}
          {direction === "sent" && dependency.state === "ESCALATED" ? <ActionButton onClick={() => void respond(dependency.id, "MARK_ASSIGNED_OUT_OF_BAND")}>Mark assigned</ActionButton> : null}
          {dependency.state === "DECLINED_NOT_CONCERNED" ? <p className="terminal-note">Terminal response · manually choose another agency if needed.</p> : null}
        </div>
      </article>;
    })}{dependencies.length === 0 ? <div className="empty-state"><strong>No dependency requests here.</strong><span>{direction === "received" ? "Requests from other agencies will appear here." : "Dependencies attached during project creation will appear here."}</span></div> : null}</section>
  </>;
}
