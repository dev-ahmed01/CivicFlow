"use client";

import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyState, EngineerSummary } from "@civicos/shared";
import { DependencyFlowCard, NextActionButton } from "../../_components/operations";
import { usePortalPolling, notifyPortalDataChanged } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

const statuses: DependencyState[] = ["PENDING_RESPONSE", "ASSIGNED", "DECLINED_UNAVAILABLE", "DECLINED_NOT_CONCERNED", "ESCALATED", "FULFILLED"];

export function DependencyTable({ direction }: { direction: "sent" | "received" }) {
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [status, setStatus] = useState("");
  const [engineerIds, setEngineerIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [responseExpandedId, setResponseExpandedId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const query = new URLSearchParams({ direction });
    if (status) query.set("status", status);
    try {
      setDependencies((await apiFetch<{ dependencies: DependencyListItem[] }>(`/dependencies?${query.toString()}`)).dependencies);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dependencies");
    }
  }, [direction, status]);
  usePortalPolling(load);

  useEffect(() => {
    if (direction !== "received") return;
    void apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers").then((result) => setEngineers(result.engineers)).catch((reason: unknown) => {
      setEngineers([]);
      setError(reason instanceof Error ? reason.message : "Could not load the engineer list");
    });
  }, [direction]);

  const respond = async (dependencyId: string, action: string, engineerId?: string) => {
    setBusyId(dependencyId);
    setError(undefined);
    try {
      await apiFetch(`/dependencies/${dependencyId}/respond`, { method: "POST", body: JSON.stringify({ action, ...(engineerId ? { engineerId } : {}) }) });
      setResponseExpandedId(undefined);
      notifyPortalDataChanged();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update dependency");
    } finally {
      setBusyId(undefined);
    }
  };

  return <>
    <section className="filter-bar dependency-filter"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label></section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="dependency-flow-grid" aria-live="polite">{dependencies.map((dependency) => {
      const pending = dependency.state === "PENDING_RESPONSE";
      const responseExpanded = responseExpandedId === dependency.id;
      const ownProjectHref = direction === "sent" ? `/project-head/projects/${dependency.project.id}` : undefined;
      return <DependencyFlowCard dependency={dependency} direction={direction} key={dependency.id} projectHref={ownProjectHref}>
        {direction === "received" && pending ? <NextActionButton onClick={() => setResponseExpandedId(responseExpanded ? undefined : dependency.id)}>{responseExpanded ? "Close Response" : "Assign Engineer"}</NextActionButton> : null}
        {direction === "sent" && dependency.state === "DECLINED_UNAVAILABLE" ? <NextActionButton busy={busyId === dependency.id} onClick={() => void respond(dependency.id, "RESEND")}>Send Again</NextActionButton> : null}
        {direction === "sent" && dependency.state === "ESCALATED" ? <NextActionButton busy={busyId === dependency.id} onClick={() => void respond(dependency.id, "MARK_ASSIGNED_OUT_OF_BAND")}>Record Assignment</NextActionButton> : null}
        {responseExpanded ? <div className="dependency-response-reveal"><div><strong>Assign this request</strong><p>Choose an engineer from your agency. The task will appear in their portal.</p></div><label>Engineer<select aria-label={`Engineer for ${dependency.id}`} value={engineerIds[dependency.id] ?? ""} onChange={(event) => setEngineerIds((current) => ({ ...current, [dependency.id]: event.target.value }))}><option value="">Choose engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label><button className="portal-primary-button" disabled={busyId === dependency.id || !engineerIds[dependency.id]} type="button" onClick={() => void respond(dependency.id, "ASSIGN_ENGINEER", engineerIds[dependency.id])}>{busyId === dependency.id ? "Assigning…" : "Assign Engineer"}</button><div className="dependency-decline-actions"><span>Cannot take this request?</span><button className="secondary" disabled={busyId === dependency.id} type="button" onClick={() => void respond(dependency.id, "DECLINE_UNAVAILABLE")}>Unavailable</button><button className="secondary" disabled={busyId === dependency.id} type="button" onClick={() => void respond(dependency.id, "DECLINE_NOT_CONCERNED")}>Not our scope</button></div></div> : null}
      </DependencyFlowCard>;
    })}{dependencies.length === 0 ? <div className="empty-state"><strong>No dependency requests here.</strong><span>{direction === "received" ? "Requests from other agencies will appear automatically." : "Add dependencies from an eligible project to connect agency work."}</span></div> : null}</section>
  </>;
}
