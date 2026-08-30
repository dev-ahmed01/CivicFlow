"use client";

import type { CoordinationRequest, EngineerSummary } from "@civicos/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, evidenceContentType, getSession, uploadFile } from "../../_lib/api";

type ActionName = "SEND" | "ACKNOWLEDGE" | "REPLY" | "REQUEST_CLARIFICATION" | "REQUEST_INSPECTION" | "ASSIGN_ENGINEER" | "PROPOSE_DATETIME" | "ACCEPT" | "START_PROGRESS" | "INSPECTION_COMPLETE" | "COMPLETE" | "REJECT" | "CLOSE";
type UploadResponse = { attachmentId: string; upload: { uploadUrl: string; headers: Record<string, string> } };

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

function actionNeedsMessage(action: ActionName): boolean {
  return ["REPLY", "REQUEST_CLARIFICATION", "REQUEST_INSPECTION", "INSPECTION_COMPLETE", "COMPLETE", "REJECT"].includes(action);
}

export function CoordinationDetailClient({ requestId }: { requestId: string }) {
  const [record, setRecord] = useState<CoordinationRequest>();
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [action, setAction] = useState<ActionName>("REPLY");
  const [message, setMessage] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [proposedAt, setProposedAt] = useState("");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setRecord((await apiFetch<{ request: CoordinationRequest }>(`/coordination-requests/${requestId}`)).request);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this coordination request");
    }
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);
  const session = getSession();
  const receiving = record?.respondingAgency.id === session?.user.agencyId;
  const assignedEngineer = Boolean(session && record?.assignedEngineer?.id === session.user.id);
  useEffect(() => {
    if (!receiving) return;
    void apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers").then((result) => setEngineers(result.engineers)).catch(() => setEngineers([]));
  }, [receiving]);

  const availableActions = useMemo<ActionName[]>(() => {
    if (!record) return [];
    if (record.status === "DRAFT") return receiving ? [] : ["SEND"];
    if (record.status === "CLOSED") return [];
    if (!receiving) return ["COMPLETED", "REJECTED"].includes(record.status) ? ["REPLY", "CLOSE"] : ["REPLY"];
    if (["COMPLETED", "REJECTED"].includes(record.status)) return [];
    if (assignedEngineer) {
      if (record.status === "ENGINEER_ASSIGNED") return ["REPLY", "START_PROGRESS", "INSPECTION_COMPLETE", "COMPLETE"];
      if (record.status === "INSPECTION_REQUIRED" || record.status === "IN_PROGRESS") return ["REPLY", "INSPECTION_COMPLETE", "COMPLETE"];
      return ["REPLY"];
    }
    const common: ActionName[] = ["REPLY", "PROPOSE_DATETIME"];
    if (record.status === "SENT") return ["ACKNOWLEDGE", ...common, "REQUEST_CLARIFICATION", "REQUEST_INSPECTION", "ASSIGN_ENGINEER", "ACCEPT", "REJECT"];
    if (record.status === "ACKNOWLEDGED") return [...common, "REQUEST_CLARIFICATION", "REQUEST_INSPECTION", "ASSIGN_ENGINEER", "ACCEPT", "START_PROGRESS", "REJECT"];
    if (record.status === "CLARIFICATION_REQUESTED") return [...common, "REQUEST_INSPECTION", "ASSIGN_ENGINEER", "ACCEPT", "REJECT"];
    if (record.status === "INSPECTION_REQUIRED") return [...common, "ASSIGN_ENGINEER", "ACCEPT", "START_PROGRESS", "REJECT"];
    if (record.status === "ENGINEER_ASSIGNED") return [...common, "ACCEPT", "START_PROGRESS", "COMPLETE", "REJECT"];
    if (record.status === "ACCEPTED") return [...common, "REQUEST_INSPECTION", "ASSIGN_ENGINEER", "START_PROGRESS", "COMPLETE"];
    if (record.status === "IN_PROGRESS") return [...common, "COMPLETE"];
    return common;
  }, [assignedEngineer, receiving, record]);

  useEffect(() => {
    const firstAction = availableActions[0];
    if (firstAction && !availableActions.includes(action)) setAction(firstAction);
  }, [action, availableActions]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!record) return;
    setBusy(true);
    setError(undefined);
    try {
      const body = action === "ASSIGN_ENGINEER"
        ? { action, engineerId, ...(message.trim() ? { message: message.trim() } : {}) }
        : action === "PROPOSE_DATETIME"
          ? { action, proposedAt: new Date(proposedAt).toISOString(), ...(message.trim() ? { message: message.trim() } : {}) }
          : action === "REJECT"
            ? { action, reason: message.trim() }
            : action === "COMPLETE" || action === "INSPECTION_COMPLETE"
              ? { action, notes: message.trim() }
              : { action, ...(message.trim() ? { message: message.trim() } : {}) };
      const result = await apiFetch<{ entry: { id: string } }>(`/coordination-requests/${record.id}/actions`, { method: "POST", body: JSON.stringify(body) });
      if (file) {
        const target = await apiFetch<UploadResponse>(`/coordination-requests/${record.id}/attachments`, { method: "POST", body: JSON.stringify({ action: "presign", entryId: result.entry.id, fileName: file.name, contentType: evidenceContentType(file), sizeBytes: file.size }) });
        await uploadFile(target.upload, file);
        await apiFetch(`/coordination-requests/${record.id}/attachments`, { method: "POST", body: JSON.stringify({ action: "complete", attachmentId: target.attachmentId }) });
      }
      setMessage("");
      setFile(undefined);
      setProposedAt("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this coordination request");
    } finally {
      setBusy(false);
    }
  };

  if (!record && !error) return <p className="portal-muted">Loading coordination record…</p>;
  if (!record) return <p className="error" role="alert">{error}</p>;
  const location = record.project.locationLabel ?? record.project.ticket?.address ?? record.project.ward?.name ?? "Not recorded";
  const needsMessage = actionNeedsMessage(action);
  const formReady = !needsMessage || message.trim().length >= 2;

  return <div className="coordination-detail-page">
    <header className="portal-heading"><div><Link className="back-link" href="/project-head/dependencies">← Coordination workspace</Link><p className="eyebrow">{label(record.requestTypeKey)}</p><h1>{record.subject}</h1><p>Work-linked request · {record.project.referenceNumber}</p></div><span className={`coordination-status status-${record.status.toLowerCase()}`}>{label(record.status)}</span></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="coordination-layout">
      <main className="coordination-thread-column">
        <section className="portal-panel coordination-request-brief"><p className="eyebrow">Request brief</p><h2>{record.subject}</h2><p>{record.details}</p></section>
        <section className="portal-panel coordination-thread" aria-labelledby="coordination-thread-title"><div className="panel-title-row"><div><p className="eyebrow">Permanent work record</p><h2 id="coordination-thread-title">Conversation and activity</h2></div><span>{record.entries.length} entries</span></div>
          <div className="coordination-thread-list">{record.entries.map((entry) => <article className="coordination-thread-entry" key={entry.id}><div className="coordination-thread-marker" /><div><header><div><strong>{entry.sender.email ?? label(entry.sender.role)}</strong><span>{entry.senderAgency.name}</span></div><time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString("en-IN")}</time></header><p className="coordination-entry-action">{label(entry.action)}{entry.toStatus ? ` · ${label(entry.toStatus)}` : ""}</p>{entry.message ? <p>{entry.message}</p> : null}{entry.attachments.length ? <div className="coordination-attachments">{entry.attachments.map((attachment) => <a href={attachment.url} key={attachment.id} rel="noreferrer" target="_blank"><span>{attachment.fileName}</span><small>{attachment.contentType} · {attachment.sizeBytes ? `${Math.ceil(attachment.sizeBytes / 1024)} KB` : "verified file"}</small></a>)}</div> : null}</div></article>)}</div>
        </section>
        {availableActions.length > 0 ? <form className="portal-panel coordination-action-form" onSubmit={(event) => void submit(event)}><div><p className="eyebrow">Record an action</p><h2>Update this request</h2></div><label>Action<select value={action} onChange={(event) => setAction(event.target.value as ActionName)}>{availableActions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>{action === "ASSIGN_ENGINEER" ? <label>Engineer<select required value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Choose Engineer</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label> : null}{action === "PROPOSE_DATETIME" ? <label>Proposed date and time<input required type="datetime-local" value={proposedAt} onChange={(event) => setProposedAt(event.target.value)} /></label> : null}<label>{needsMessage ? action === "REJECT" ? "Reason" : action === "COMPLETE" ? "Completion notes" : "Message" : "Message (optional)"}<textarea minLength={needsMessage ? 2 : undefined} required={needsMessage} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add context that should remain in the work record." /></label><label>Attach report or evidence<input accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(event) => setFile(event.target.files?.[0])} type="file" /><small>PDF or image, up to 20 MB.</small></label><button className="portal-primary-button" disabled={busy || !formReady || action === "ASSIGN_ENGINEER" && !engineerId || action === "PROPOSE_DATETIME" && !proposedAt} type="submit">{busy ? "Recording…" : `Record ${label(action)}`}</button></form> : null}
      </main>
      <aside className="coordination-metadata portal-panel"><p className="eyebrow">Request metadata</p><h2>Operational context</h2><dl><div><dt>Requesting agency</dt><dd>{record.requestingAgency.name}</dd></div><div><dt>Receiving agency</dt><dd>{record.respondingAgency.name}</dd></div><div><dt>Related work</dt><dd><Link href={`/project-head/projects/${record.project.id}`}>{record.project.referenceNumber} · {record.project.title}</Link></dd></div>{record.conflictingProject ? <div><dt>Conflicting work</dt><dd>{record.conflictingProject.referenceNumber} · {record.conflictingProject.title}<br />{record.conflictingProject.agency.name}</dd></div> : null}<div><dt>Location</dt><dd>{location}</dd></div><div><dt>Status</dt><dd>{label(record.status)}</dd></div><div><dt>Response deadline</dt><dd>{new Date(record.responseDeadline).toLocaleString("en-IN")}</dd></div><div><dt>Assigned people</dt><dd>{record.assignedEngineer?.email ?? "Not assigned"}</dd></div><div><dt>Inspection</dt><dd>{record.inspectionCompletedAt ? `Completed ${new Date(record.inspectionCompletedAt).toLocaleString("en-IN")}` : record.inspectionNeeded ? "Required" : "Not required"}</dd></div><div><dt>Engineer required</dt><dd>{record.engineerRequired ? "Yes" : "No"}</dd></div><div><dt>Proposed date/time</dt><dd>{record.proposedAt ? new Date(record.proposedAt).toLocaleString("en-IN") : "Not proposed"}</dd></div><div><dt>Formal dependency</dt><dd>{record.dependencyId ?? "Created when sent"}</dd></div></dl>{record.conflictingProject ? <p className="portal-muted">Accepted road dependencies feed the existing advisory, rule-traced sequencing engine.</p> : null}</aside>
    </div>
  </div>;
}
