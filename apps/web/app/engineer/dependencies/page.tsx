"use client";

import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyResponse } from "@civicos/shared";
import { ActionButton, PortalStatePill, PrimaryButton } from "../../_components/ui";
import { apiFetch, getSession } from "../_lib/api";

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

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Agency coordination</p><h1>Dependencies</h1><p>Respond to partner-agency requests or track requests sent from your projects.</p></div></header>
    <div className="notification-filters" role="tablist"><button aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => { setDirection("received"); setExpandedId(undefined); }} role="tab" type="button">Inbox</button><button aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => { setDirection("sent"); setExpandedId(undefined); }} role="tab" type="button">Outbox</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="dependency-list">{items.map((item) => {
      const pending = direction === "received" && item.state === "PENDING_RESPONSE";
      const expanded = expandedId === item.id;
      return <article className={`dependency-row ${pending ? "priority-row" : ""}`} key={item.id}><div className="dependency-main"><div className="dependency-top"><PortalStatePill state={item.state} />{pending ? <strong className="response-flag">Response required</strong> : null}</div><h2>{item.project.ticket?.title ?? "Agency coordination"}</h2><p>{item.requirement}</p><small>{direction === "received" ? `Requested by ${item.requestingAgency.name}` : `Sent to ${item.respondingAgency.name}`} · Due {new Date(item.deadline).toLocaleString("en-IN")}</small></div>{pending ? <div className="dependency-actions"><ActionButton expanded={expanded} onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close" : "Respond"}</ActionButton>{expanded ? <div className="dependency-response-reveal"><PrimaryButton disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "ASSIGN_ENGINEER", engineerId: getSession()?.user.id ?? "" })} type="button">Assign to me</PrimaryButton><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_UNAVAILABLE" })} type="button">Unavailable</button><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_NOT_CONCERNED" })} type="button">Not our scope</button></div> : null}</div> : null}</article>;
    })}{items.length === 0 ? <div className="empty-state"><strong>No {direction} dependency requests.</strong></div> : null}</section>
  </>;
}
