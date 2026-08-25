"use client";

import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyResponse } from "@civicos/shared";
import { ActionButton, PortalStatePill, PrimaryButton } from "../../_components/ui";
import { apiFetch, getSession } from "../_lib/api";

function exactDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function EngineerDependenciesPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [items, setItems] = useState<DependencyListItem[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try { setItems((await apiFetch<{ dependencies: DependencyListItem[] }>(`/dependencies?direction=${direction}`)).dependencies); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load dependencies"); }
  }, [direction]);
  useEffect(() => { void load(); }, [load]);

  const respond = async (id: string, response: DependencyResponse) => {
    setBusyId(id);
    try { await apiFetch(`/dependencies/${id}/respond`, { method: "POST", body: JSON.stringify(response) }); await load(); setExpandedId(undefined); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update dependency"); }
    finally { setBusyId(undefined); }
  };
  const responseCount = items.filter((item) => item.state === "PENDING_RESPONSE").length;

  return <div className="engineer-dependencies-page">
    <header className="portal-heading"><div><p className="eyebrow">Agency coordination</p><h1>Dependencies</h1><p>Respond to partner-agency requests or track requests sent from your projects.</p></div><div className="engineer-dependency-summary"><strong>{direction === "received" ? responseCount : items.length}</strong><span>{direction === "received" ? "need a response" : "requests sent"}</span></div></header>
    <div aria-label="Dependency views" className="engineer-work-tabs" role="tablist"><button aria-controls="engineer-dependency-results" aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => { setDirection("received"); setExpandedId(undefined); }} role="tab" type="button">Received</button><button aria-controls="engineer-dependency-results" aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => { setDirection("sent"); setExpandedId(undefined); }} role="tab" type="button">Sent</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" className="engineer-dependency-list" id="engineer-dependency-results" role="tabpanel" tabIndex={0}>{items.map((item) => {
      const pending = direction === "received" && item.state === "PENDING_RESPONSE";
      const expanded = expandedId === item.id;
      const partner = direction === "received" ? item.requestingAgency.name : item.respondingAgency.name;
      return <article className={`engineer-dependency-card ${pending ? "priority" : ""}`} key={item.id}>
        <header><div><PortalStatePill state={item.state} />{pending ? <span className="response-flag">Response required</span> : null}</div><code>DEP-{item.id.slice(0, 6).toUpperCase()}</code></header>
        <div className="engineer-dependency-body"><div><p className="eyebrow">{direction === "received" ? `From ${partner}` : `To ${partner}`}</p><h2>{item.project.ticket?.title ?? "Agency coordination request"}</h2><p className="engineer-dependency-requirement">{item.requirement}</p></div><dl><div><dt>Partner agency</dt><dd>{partner}</dd></div><div><dt>Response due</dt><dd>{exactDateTime(item.deadline)}</dd></div><div><dt>Project</dt><dd>{item.project.id.slice(0, 8)}</dd></div></dl></div>
        {pending ? <div className="engineer-dependency-actions"><ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close response" : "Respond"}</ActionButton>{expanded ? <div className="dependency-response-reveal"><div><strong>Choose a response</strong><p>Confirm ownership or explain why this request cannot be taken by your agency.</p></div><PrimaryButton disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "ASSIGN_ENGINEER", engineerId: getSession()?.user.id ?? "" })} type="button">Assign to me</PrimaryButton><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_UNAVAILABLE" })} type="button">Unavailable</button><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_NOT_CONCERNED" })} type="button">Not our scope</button></div> : null}</div> : item.assignedEngineer?.email ? <p className="engineer-dependency-owner">Assigned to {item.assignedEngineer.email}</p> : null}
      </article>;
    })}{items.length === 0 ? <div className="empty-state engineer-dependency-empty"><strong>No {direction} dependency requests.</strong><span>Coordination requests will appear here when another project needs agency input.</span></div> : null}</section>
  </div>;
}
