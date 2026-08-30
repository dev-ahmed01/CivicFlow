"use client";

import type { Agency, CreateCoordinationDraft } from "@civicos/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, evidenceContentType, uploadFile } from "../_lib/api";

type DraftResponse = {
  request: { id: string };
  initialEntryId: string;
};

type UploadResponse = {
  attachmentId: string;
  upload: { uploadUrl: string; headers: Record<string, string> };
};

function typeLabel(key: string): string {
  return key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export type CoordinationPrefill = {
  respondingAgencyId: string;
  requestTypeKey: string;
  subject: string;
  details: string;
  initialMessage: string;
  conflictSource: NonNullable<CreateCoordinationDraft["conflictSource"]>;
};

export function CoordinationComposer({ projectId, agencies, requestTypes, onCancel, prefill }: {
  projectId: string;
  agencies: Agency[];
  requestTypes: string[];
  onCancel: () => void;
  prefill?: CoordinationPrefill;
}) {
  const router = useRouter();
  const [respondingAgencyId, setRespondingAgencyId] = useState(prefill?.respondingAgencyId ?? "");
  const [requestTypeKey, setRequestTypeKey] = useState(prefill?.requestTypeKey ?? requestTypes[0] ?? "");
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [details, setDetails] = useState(prefill?.details ?? "");
  const [initialMessage, setInitialMessage] = useState(prefill?.initialMessage ?? "");
  const [responseDeadline, setResponseDeadline] = useState(() => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [inspectionNeeded, setInspectionNeeded] = useState(false);
  const [engineerRequired, setEngineerRequired] = useState(false);
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const firstType = requestTypes[0];
    if (!requestTypeKey && firstType) setRequestTypeKey(firstType);
  }, [requestTypeKey, requestTypes]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const draft = await apiFetch<DraftResponse>(`/projects/${projectId}/coordination-requests`, {
        method: "POST",
        body: JSON.stringify({
          respondingAgencyId,
          requestTypeKey,
          subject,
          details,
          initialMessage,
          responseDeadline: new Date(responseDeadline).toISOString(),
          inspectionNeeded,
          engineerRequired,
          ...(prefill ? { conflictSource: prefill.conflictSource } : {}),
        }),
      });
      if (file) {
        const target = await apiFetch<UploadResponse>(`/coordination-requests/${draft.request.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ action: "presign", entryId: draft.initialEntryId, fileName: file.name, contentType: evidenceContentType(file), sizeBytes: file.size }),
        });
        await uploadFile(target.upload, file);
        await apiFetch(`/coordination-requests/${draft.request.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ action: "complete", attachmentId: target.attachmentId }),
        });
      }
      await apiFetch(`/coordination-requests/${draft.request.id}/actions`, { method: "POST", body: JSON.stringify({ action: "SEND" }) });
      router.push(`/project-head/coordination/${draft.request.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the coordination request");
    } finally {
      setBusy(false);
    }
  };

  return <form className="portal-panel coordination-composer" onSubmit={(event) => void submit(event)}>
    <div className="coordination-form-heading"><div><p className="eyebrow">Work-linked agency request</p><h2>Coordinate with agency</h2><p>{prefill ? "Conflict, opposing work, location, and relevant dates are pre-filled from the advisory warning." : "This request and every response will remain attached to this civic work record."}</p></div><button className="secondary" onClick={onCancel} type="button">Cancel</button></div>
    <div className="coordination-form-grid">
      <label>Receiving agency<select required value={respondingAgencyId} onChange={(event) => setRespondingAgencyId(event.target.value)}><option value="">Choose agency</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name} · {agency.type}</option>)}</select></label>
      <label>Request type<select required value={requestTypeKey} onChange={(event) => setRequestTypeKey(event.target.value)}>{requestTypes.map((key) => <option key={key} value={key}>{typeLabel(key)}</option>)}</select></label>
      <label className="coordination-form-span">Subject / title<input maxLength={180} minLength={5} required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Utility clearance required before carriageway excavation" /></label>
      <label className="coordination-form-span">Detailed request<textarea maxLength={10000} minLength={10} required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the requested action, work constraints, location context, and expected outcome." /></label>
      <label className="coordination-form-span">Opening message<textarea maxLength={5000} minLength={2} required value={initialMessage} onChange={(event) => setInitialMessage(event.target.value)} placeholder="Add the first note for the receiving agency." /></label>
      <label>Required response date<input required type="datetime-local" value={responseDeadline} onChange={(event) => setResponseDeadline(event.target.value)} /></label>
      <label>Supporting file<input accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(event) => setFile(event.target.files?.[0])} type="file" /><small>PDF or image, up to 20 MB.</small></label>
    </div>
    <div className="coordination-checks"><label><input checked={inspectionNeeded} onChange={(event) => setInspectionNeeded(event.target.checked)} type="checkbox" /> Inspection is needed</label><label><input checked={engineerRequired} onChange={(event) => setEngineerRequired(event.target.checked)} type="checkbox" /> Engineer is required</label></div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <button className="portal-primary-button" disabled={busy || !respondingAgencyId || !requestTypeKey || subject.trim().length < 5 || details.trim().length < 10 || initialMessage.trim().length < 2} type="submit">{busy ? "Sending request…" : "Send coordination request"}</button>
  </form>;
}
