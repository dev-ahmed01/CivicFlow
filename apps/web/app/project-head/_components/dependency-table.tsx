"use client";

import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyState, EngineerSummary } from "@civicos/shared";
import { ActionButton, PortalStatePill } from "../../_components/ui";
import { apiFetch } from "../_lib/api";

const statuses: DependencyState[] = ["PENDING_RESPONSE", "ASSIGNED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED", "ESCALATED", "FULFILLED"];
type InboxChoice = "" | "ASSIGN_ENGINEER" | "DECLINE_UNAVAILABLE" | "DECLINE_NOT_CONCERNED";

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
  const [choices, setChoices] = useState<Record<string, InboxChoice>>({});
  const [engineerIds, setEngineerIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
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
    void apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers").then((result) => setEngineers(result.engineers)).catch(() => setEngineers([]));
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
      setExpandedId(undefined);
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
      const choice = choices[dependency.id] ?? "";
      const expanded = expandedId === dependency.id;
      return <article className={`dependency-row ${pending ? "priority-row" : ""}`} key={dependency.id}>
        <div className="dependency-main"><div className="dependency-top"><PortalStatePill state={direction === "sent" ? outboxLabel(dependency.state) : dependency.state} />{pending ? <strong className="response-flag">Response required</strong> : null}</div><h2>{dependency.project.ticket?.title ?? "Agency coordination"}</h2><p>{dependency.requirement}</p><dl><div><dt>{direction === "received" ? "Requested by" : "Sent to"}</dt><dd>{otherAgency.name}</dd></div><div><dt>Deadline</dt><dd>{new Date(dependency.deadline).toLocaleString("en-IN")}</dd></div><div><dt>Countdown</dt><dd className={pending ? "countdown" : ""}>{pending ? countdown(dependency.deadline, now) : "Response recorded"}</dd></div>{dependency.assignedEngineer ? <div><dt>Assigned Engineer</dt><dd>{dependency.assignedEngineer.email}</dd></div> : null}</dl>{dependency.contacts.length > 0 ? <div className="escalation-contact"><strong>Escalation contact</strong>{dependency.contacts.map((contact) => <a href={`mailto:${contact.email}`} key={contact.email}>{contact.email}</a>)}</div> : null}</div>
        <div className="dependency-actions">
          {direction === "received" && pending ? <><ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : dependency.id)}>{expanded ? "Close" : "Respond"}</ActionButton>{expanded ? <div className="dependency-response-reveal"><label>Response<select aria-label={`Response for ${dependency.id}`} value={choice} onChange={(event) => setChoices({ ...choices, [dependency.id]: event.target.value as InboxChoice })}><option value="">Choose response</option><option value="ASSIGN_ENGINEER">Assign Engineer</option><option value="DECLINE_UNAVAILABLE">Unavailable</option><option value="DECLINE_NOT_CONCERNED">Not Our Scope</option></select></label>{choice === "ASSIGN_ENGINEER" ? <label>Engineer<select value={engineerIds[dependency.id] ?? ""} onChange={(event) => setEngineerIds({ ...engineerIds, [dependency.id]: event.target.value })}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label> : null}<button className="portal-primary-button" disabled={!choice || busyId === dependency.id || choice === "ASSIGN_ENGINEER" && !engineerIds[dependency.id]} type="button" onClick={() => void respond(dependency.id, choice, engineerIds[dependency.id])}>{busyId === dependency.id ? "Saving…" : "Submit response"}</button></div> : null}</> : null}
          {direction === "sent" && dependency.state === "DECLINED_UNAVAILABLE" ? <ActionButton onClick={() => void respond(dependency.id, "RESEND")}>Re-send request</ActionButton> : null}
          {direction === "sent" && dependency.state === "ESCALATED" ? <ActionButton onClick={() => void respond(dependency.id, "MARK_ASSIGNED_OUT_OF_BAND")}>Mark assigned</ActionButton> : null}
          {dependency.state === "DECLINED_NOT_CONCERNED" ? <p className="terminal-note">Terminal response · manually choose another agency if needed.</p> : null}
        </div>
      </article>;
    })}{dependencies.length === 0 ? <div className="empty-state"><strong>No dependency requests here.</strong><span>{direction === "received" ? "Requests from other agencies will appear here." : "Dependencies attached during project creation will appear here."}</span></div> : null}</section>
  </>;
}
