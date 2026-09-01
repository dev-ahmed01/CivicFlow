"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { InspectionDetail } from "@civicos/shared";
import { notifyPortalDataChanged, usePortalPolling } from "../../../_lib/portal-refresh";
import { apiFetch, completionContentType, uploadFile } from "../../_lib/api";

export function InspectionDetailClient({ inspectionId }: { inspectionId: string }) {
  const [inspection, setInspection] = useState<InspectionDetail>();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try { setInspection((await apiFetch<{ inspection: InspectionDetail }>(`/inspections/${inspectionId}`)).inspection); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load inspection"); }
  }, [inspectionId]);
  usePortalPolling(load);

  const action = async (name: "accept" | "start") => {
    setBusy(true);
    try { await apiFetch(`/inspections/${inspectionId}/${name}`, { method: "POST" }); notifyPortalDataChanged(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : `Could not ${name} inspection`); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError("Attach at least one site evidence image"); return; }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const contentType = completionContentType(file);
      const target = await apiFetch<{ evidenceId: string; upload: { uploadUrl: string; headers: Record<string, string> } }>(`/inspections/${inspectionId}/evidence`, { method: "POST", body: JSON.stringify({ action: "presign", fileName: file.name, contentType, sizeBytes: file.size }) });
      await uploadFile(target.upload, file);
      await apiFetch(`/inspections/${inspectionId}/evidence`, { method: "POST", body: JSON.stringify({ action: "complete", evidenceId: target.evidenceId }) });
      const latitude = Number(form.get("latitude"));
      const longitude = Number(form.get("longitude"));
      await apiFetch(`/inspections/${inspectionId}/submit`, { method: "POST", body: JSON.stringify({
        issueConfirmation: form.get("issueConfirmation"), severity: form.get("severity"), observations: form.get("observations"),
        recommendedWork: form.get("recommendedWork"), complexity: form.get("complexity"), coordinationRequired: form.get("coordinationRequired") === "on",
        otherAgencyInvolvement: String(form.get("otherAgencyInvolvement") || "") || undefined, recommendation: form.get("recommendation"), latitude, longitude,
      }) });
      notifyPortalDataChanged(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit inspection"); }
    finally { setBusy(false); }
  };

  if (!inspection) return <main className="portal-loading">Opening inspection…</main>;
  const editable = ["ACCEPTED", "IN_PROGRESS"].includes(inspection.status);
  return <div className="field-module inspection-detail">
    <header className="portal-heading"><div><Link className="back-link" href="/engineer/inspections">← Inspections</Link><p className="eyebrow">{inspection.ticket.referenceNumber}</p><h1>{inspection.ticket.title}</h1><p>{inspection.ticket.address}</p></div><span className={`field-state state-${inspection.status.toLowerCase()}`}>{inspection.status.replaceAll("_", " ")}</span></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="inspection-context"><header><p className="eyebrow">Citizen issue context</p><h2>What was reported</h2></header><dl><div><dt>Category</dt><dd>{inspection.ticket.category.name}</dd></div><div><dt>Ward</dt><dd>{inspection.ticket.ward.name}</dd></div><div><dt>Road</dt><dd>{inspection.ticket.roadSegment?.roadName ?? "Not linked"}</dd></div><div><dt>Deadline</dt><dd>{new Date(inspection.deadline).toLocaleString("en-IN")}</dd></div></dl><div className="inspection-observations">{inspection.ticket.observations.map((item) => <figure key={item.id}><img alt="Reported site evidence" src={item.imageUrl} /><figcaption>{item.note ?? item.address ?? "Citizen evidence"}</figcaption></figure>)}</div></section>
    {inspection.status === "ASSIGNED" ? <section className="field-primary-action"><div><p className="eyebrow">Next action</p><h2>Accept the site inspection</h2><p>Accepting confirms that this inspection is assigned to you. It does not start civic work.</p></div><button className="primary-button" disabled={busy} onClick={() => void action("accept")} type="button">Accept Inspection</button></section> : null}
    {inspection.status === "ACCEPTED" ? <section className="field-primary-action"><div><p className="eyebrow">At the site</p><h2>Begin evidence capture</h2><p>Start the inspection when you reach the reported location.</p></div><button className="primary-button" disabled={busy} onClick={() => void action("start")} type="button">Start Inspection</button></section> : null}
    {editable ? <form className="structured-inspection-form" onSubmit={(event) => void submit(event)}><header><p className="eyebrow">Structured assessment</p><h2>Submit inspection result</h2><p>Your Project Head will review this result and decide whether civic work should be created.</p></header><div className="form-grid">
      <label>Issue confirmation<select name="issueConfirmation" required><option value="CONFIRMED">Confirmed</option><option value="PARTIALLY_CONFIRMED">Partially confirmed</option><option value="NOT_OBSERVED">Not observed</option></select></label>
      <label>Severity<select name="severity" required><option value="MEDIUM">Medium</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
      <label className="span-2">Observations<textarea name="observations" minLength={10} required rows={4} /></label>
      <label className="span-2">Recommended work<textarea name="recommendedWork" minLength={5} required rows={3} /></label>
      <label>Complexity<select name="complexity" required><option value="MODERATE">Moderate</option><option value="SIMPLE">Simple</option><option value="COMPLEX">Complex</option></select></label>
      <label>Recommendation<select name="recommendation" required><option value="PROCEED">Proceed</option><option value="COORDINATION_REQUIRED">Coordination required</option><option value="ADDITIONAL_INVESTIGATION">Additional investigation</option><option value="NO_WORK_REQUIRED">No work required</option></select></label>
      <label>Latitude<input name="latitude" required step="any" type="number" /></label><label>Longitude<input name="longitude" required step="any" type="number" /></label>
      <label className="span-2"><input name="coordinationRequired" type="checkbox" /> Other-agency coordination is required</label><label className="span-2">Other agency involvement<input name="otherAgencyInvolvement" /></label>
      <label className="span-2">Site evidence image<input accept="image/*" onChange={(event) => setFile(event.target.files?.[0])} required type="file" /></label>
    </div><button className="primary-button" disabled={busy} type="submit">{busy ? "Submitting…" : "Submit Inspection"}</button></form> : null}
    {["SUBMITTED", "REVIEWED"].includes(inspection.status) ? <section className="inspection-result"><p className="eyebrow">Submitted assessment</p><h2>{inspection.issueConfirmation?.replaceAll("_", " ")}</h2><p>{inspection.observations}</p><dl><div><dt>Severity</dt><dd>{inspection.severity}</dd></div><div><dt>Recommendation</dt><dd>{inspection.recommendation?.replaceAll("_", " ")}</dd></div><div><dt>Project Head decision</dt><dd>{inspection.reviewDecision?.replaceAll("_", " ") ?? "Awaiting review"}</dd></div></dl></section> : null}
  </div>;
}
