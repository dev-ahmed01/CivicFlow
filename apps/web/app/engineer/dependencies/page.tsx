"use client";

import { useCallback, useState } from "react";
import type { DependencyListItem, DependencyResponse } from "@civicos/shared";
import { DependencyFlowCard, NextActionButton } from "../../_components/operations";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch, getSession } from "../_lib/api";

export default function EngineerDependenciesPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [items, setItems] = useState<DependencyListItem[]>([]);
  const [busyId, setBusyId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ dependencies: DependencyListItem[] }>(`/dependencies?direction=${direction}`)).dependencies);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load dependencies");
    }
  }, [direction]);
  usePortalPolling(load);

  const respond = async (id: string, response: DependencyResponse) => {
    setBusyId(id);
    setError(undefined);
    try {
      await apiFetch(`/dependencies/${id}/respond`, { method: "POST", body: JSON.stringify(response) });
      setExpandedId(undefined);
      notifyPortalDataChanged();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update dependency");
    } finally {
      setBusyId(undefined);
    }
  };
  const currentUserId = getSession()?.user.id;
  const responseCount = items.filter((item) => item.state === "PENDING_RESPONSE").length;
  const assignedToMe = items.filter((item) => item.state === "ASSIGNED" && item.assignedEngineer?.id === currentUserId).length;

  return <div className="engineer-dependencies-page">
    <header className="portal-heading"><div><p className="eyebrow">Agency coordination</p><h1>Dependencies</h1><p>See how your project connects to partner agencies, then act on the current dependency state.</p></div><div className="engineer-dependency-summary"><strong>{direction === "received" ? responseCount + assignedToMe : items.length}</strong><span>{direction === "received" ? "actionable tasks" : "requests sent"}</span></div></header>
    <div aria-label="Dependency views" className="engineer-work-tabs" role="tablist"><button aria-controls="engineer-dependency-results" aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => { setDirection("received"); setExpandedId(undefined); }} role="tab" type="button">Received</button><button aria-controls="engineer-dependency-results" aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => { setDirection("sent"); setExpandedId(undefined); }} role="tab" type="button">Sent</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section aria-live="polite" className="dependency-flow-grid" id="engineer-dependency-results" role="tabpanel" tabIndex={0}>{items.map((item) => {
      const pending = direction === "received" && item.state === "PENDING_RESPONSE";
      const expanded = expandedId === item.id;
      const ownedTask = direction === "received" && item.state === "ASSIGNED" && item.assignedEngineer?.id === currentUserId;
      return <DependencyFlowCard dependency={item} direction={direction} key={item.id} projectHref={`/engineer/projects/${item.project.id}`}>
        {pending ? <NextActionButton onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close Response" : "Accept / Respond"}</NextActionButton> : null}
        {ownedTask ? <NextActionButton busy={busyId === item.id} onClick={() => void respond(item.id, { action: "FULFILL" })}>Mark Fulfilled</NextActionButton> : null}
        {expanded ? <div className="dependency-response-reveal"><div><strong>Choose a response</strong><p>Accept ownership or explain why your agency cannot take this request.</p></div><NextActionButton busy={busyId === item.id} onClick={() => void respond(item.id, { action: "ASSIGN_ENGINEER", engineerId: currentUserId ?? "" })}>Assign to Me</NextActionButton><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_UNAVAILABLE" })} type="button">Unavailable</button><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_NOT_CONCERNED" })} type="button">Not our scope</button></div> : null}
      </DependencyFlowCard>;
    })}{items.length === 0 ? <div className="empty-state engineer-dependency-empty"><strong>No {direction} dependency requests.</strong><span>Coordination requests will appear automatically when projects connect agency work.</span></div> : null}</section>
  </div>;
}
