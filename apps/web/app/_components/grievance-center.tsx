"use client";

import { useCallback, useState } from "react";
import type { GrievanceStatus, GrievanceSummary } from "@civicos/shared";
import { NextActionButton } from "./operations";
import { PortalStatePill } from "./ui";
import { usePortalPolling } from "../_lib/portal-refresh";

type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;
type GrievanceItem = GrievanceSummary & {
  ticket: { id: string; title: string; referenceNumber: string };
  responsibleAgency: { id: string; name: string };
  responsibleUser: { id: string; email: string | null } | null;
};

export function GrievanceCenter({ apiFetch }: { apiFetch: ApiFetch }) {
  const [items, setItems] = useState<GrievanceItem[]>([]);
  const [reviewingId, setReviewingId] = useState<string>();
  const [resolutionNote, setResolutionNote] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ grievances: GrievanceItem[] }>("/grievances")).grievances);
      setError(undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load grievances"); }
  }, [apiFetch]);
  usePortalPolling(load);

  const update = async (id: string, status: GrievanceStatus, note?: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/grievances/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...(note ? { resolutionNote: note } : {}) }) });
      setReviewingId(undefined); setResolutionNote(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update grievance"); }
    finally { setBusyId(undefined); }
  };

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Tracked escalation</p><h1>Grievances</h1><p>Citizen disputes and automatic non-response escalations linked to their original civic work.</p></div></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="project-action-grid">{items.map((item) => <article className={`project-action-card ${item.status === "ESCALATED" ? "grievance-card-escalated" : ""}`} key={item.id}>
      <header><div><p className="eyebrow">{item.source === "AUTO_NON_RESPONSE" ? "Automatic escalation" : "Citizen grievance"}</p><h2>{item.ticket.title}</h2></div><PortalStatePill state={item.status} /></header>
      <p>{item.reason.replaceAll("_", " ")}</p>{item.note ? <p>{item.note}</p> : null}
      <dl><div><dt>Ticket</dt><dd>{item.ticket.referenceNumber}</dd></div><div><dt>Agency</dt><dd>{item.responsibleAgency.name}</dd></div><div><dt>Responsible</dt><dd>{item.responsibleUser?.email ?? "Agency review"}</dd></div><div><dt>Created</dt><dd>{new Date(item.createdAt).toLocaleDateString("en-IN")}</dd></div></dl>
      {item.evidenceUrl ? <a href={item.evidenceUrl} rel="noreferrer" target="_blank">View citizen evidence →</a> : null}
      <footer><div className="project-next-actions">{item.status === "OPEN" || item.status === "REOPENED" ? <NextActionButton busy={busyId === item.id} onClick={() => void update(item.id, "UNDER_REVIEW")}>Review Grievance</NextActionButton> : null}{item.status !== "RESOLVED" ? <NextActionButton secondary onClick={() => setReviewingId(reviewingId === item.id ? undefined : item.id)}>Resolve</NextActionButton> : null}</div><span>{item.escalatedAt ? `Escalated ${new Date(item.escalatedAt).toLocaleDateString("en-IN")}` : item.status.replaceAll("_", " ")}</span></footer>
      {reviewingId === item.id ? <div className="dependency-response-reveal"><label>Resolution note<textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></label><NextActionButton busy={busyId === item.id} onClick={() => void update(item.id, "RESOLVED", resolutionNote)}>{resolutionNote.trim() ? "Resolve Grievance" : "Add a resolution note"}</NextActionButton></div> : null}
    </article>)}{items.length === 0 ? <div className="empty-state"><strong>No grievances need review.</strong><span>New citizen disputes and automatic escalations will appear here.</span></div> : null}</section>
  </>;
}
