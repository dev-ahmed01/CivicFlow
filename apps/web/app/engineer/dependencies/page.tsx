"use client";

import { EngineerTip, EngineerSymbol } from "../_components/engineer-ui";
import { useCallback, useState } from "react";
import type { DependencyListItem, DependencyResponse } from "@civicos/shared";
import { EngineerDependencyCard } from "../_components/dependency-card";
import { NextActionButton } from "../../_components/operations";
import { notifyPortalDataChanged, usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch, getSession } from "../_lib/api";

export default function EngineerDependenciesPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [items, setItems] = useState<DependencyListItem[]>([]);
  const [sort, setSort] = useState("latest");
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

  const overdue = items.filter((item) => !["FULFILLED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED"].includes(item.state) && new Date(item.deadline).getTime() < Date.now());
  const sorted = [...items].sort((a, b) => sort === "deadline" ? new Date(a.deadline).getTime() - new Date(b.deadline).getTime() : new Date(b.respondedAt ?? b.createdAt).getTime() - new Date(a.respondedAt ?? a.createdAt).getTime());
  return <div className="engineer-dependencies-page">
    <header className="portal-heading"><div><p className="eyebrow">Agency coordination</p><h1>Dependencies</h1><p>See how your project connects to partner agencies, then act on the current dependency state.</p></div><div className="engineer-dependency-summary"><strong>{direction === "received" ? responseCount + assignedToMe : items.length}</strong><span>{direction === "received" ? "actionable tasks" : "requests sent"}</span></div></header>
    <div aria-label="Dependency views" className="engineer-work-tabs" role="tablist"><button aria-controls="engineer-dependency-results" aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => { setDirection("received"); setExpandedId(undefined); }} role="tab" type="button">Received</button><button aria-controls="engineer-dependency-results" aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => { setDirection("sent"); setExpandedId(undefined); }} role="tab" type="button">Sent</button></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="engineer-stat-grid">{[
      { value: items.filter((item) => item.state === "FULFILLED").length, label: "Connected work", note: "Fulfilled", tone: "green", icon: "connected" },
      { value: overdue.length, label: "Needs attention", note: "Overdue", tone: "amber", icon: "attention" },
      { value: items.filter((item) => item.state === "ASSIGNED").length, label: "Waiting on others", note: "In progress", tone: "blue", icon: "people" },
      { value: items.filter((item) => item.state === "ESCALATED").length, label: "Blocked", note: "Escalated requests", tone: "red", icon: "blocked" },
    ].map((stat) => <article className="engineer-stat" key={stat.label}><span className={"engineer-symbol " + stat.tone}><EngineerSymbol name={stat.icon} /></span><div><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.note}</small></div></article>)}</div>
    {overdue[0] ? <section className="engineer-attention"><p className="eyebrow">Needs your attention</p><div><span className="engineer-symbol amber"><EngineerSymbol name="attention" /></span><div><strong>{overdue.length} {overdue.length === 1 ? "dependency is" : "dependencies are"} overdue</strong><p>{overdue[0].project.ticket?.title ?? "Agency coordination"}</p><span>From {overdue[0].requestingAgency.name} &middot; <b>Overdue by {Math.ceil((Date.now() - new Date(overdue[0].deadline).getTime()) / 86400000)} days</b></span></div><button className="next-action-button primary" type="button" onClick={() => { setExpandedId(overdue[0]!.id); document.getElementById("dependency-" + overdue[0]!.id)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Review now &rarr;</button></div></section> : null}
    <div className="engineer-register-heading"><h2>Connected work</h2><label>Sort by: <select aria-label="Sort connected work" value={sort} onChange={(event) => setSort(event.target.value)}><option value="latest">Latest response</option><option value="deadline">Deadline</option></select></label></div>
    <section aria-live="polite" className="dependency-flow-grid" id="engineer-dependency-results" role="tabpanel" tabIndex={0}>{sorted.map((item) => {
      const pending = direction === "received" && item.state === "PENDING_RESPONSE";
      const expanded = expandedId === item.id;
      const ownedTask = direction === "received" && item.state === "ASSIGNED" && item.assignedEngineer?.id === currentUserId;
      return <div id={"dependency-" + item.id} key={item.id}><EngineerDependencyCard dependency={item} direction={direction} projectHref={`/engineer/projects/${item.project.id}`}>
        {pending ? <NextActionButton onClick={() => setExpandedId(expanded ? undefined : item.id)}>{expanded ? "Close Response" : "Accept / Respond"}</NextActionButton> : null}
        {ownedTask ? <NextActionButton busy={busyId === item.id} onClick={() => void respond(item.id, { action: "FULFILL" })}>Mark Fulfilled</NextActionButton> : null}
        {expanded && pending ? <div className="dependency-response-reveal"><div><strong>Choose a response</strong><p>Accept ownership or explain why your agency cannot take this request.</p></div><NextActionButton busy={busyId === item.id} onClick={() => void respond(item.id, { action: "ASSIGN_ENGINEER", engineerId: currentUserId ?? "" })}>Assign to Me</NextActionButton><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_UNAVAILABLE" })} type="button">Unavailable</button><button className="secondary" disabled={busyId === item.id} onClick={() => void respond(item.id, { action: "DECLINE_NOT_CONCERNED" })} type="button">Not our scope</button></div> : null}
      </EngineerDependencyCard></div>;
    })}{items.length === 0 ? <div className="empty-state engineer-dependency-empty"><strong>No {direction} dependency requests.</strong><span>Coordination requests will appear automatically when projects connect agency work.</span></div> : null}</section>
    <EngineerTip>Keep your coordination details updated to avoid delays and ensure smooth execution.</EngineerTip>
  </div>;
}
