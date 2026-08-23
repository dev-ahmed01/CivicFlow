"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { CategorySummary, WardSummary } from "@civicos/shared";
import { apiFetch, evidenceContentType, uploadFile } from "../../_lib/api";

type UploadTarget = { uploadUrl: string; headers: Record<string, string> };

export default function AgencyTicketPage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [wardId, setWardId] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [createdId, setCreatedId] = useState<string>();

  useEffect(() => {
    void Promise.all([apiFetch<{ categories: CategorySummary[] }>("/categories"), apiFetch<{ wards: WardSummary[] }>("/wards")])
      .then(([categoryResult, wardResult]) => { setCategories(categoryResult.categories); setWards(wardResult.wards); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the form"));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!evidence) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await apiFetch<{ ticketId: string; imageId: string; upload: UploadTarget }>("/tickets/agency-originated", {
        method: "POST",
        body: JSON.stringify({ action: "create", categoryId, wardId, description, evidence: { fileName: evidence.name, contentType: evidenceContentType(evidence) } }),
      });
      await uploadFile(created.upload, evidence);
      await apiFetch("/tickets/agency-originated", { method: "POST", body: JSON.stringify({ action: "complete", imageId: created.imageId }) });
      setCreatedId(created.ticketId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create ticket");
    } finally {
      setBusy(false);
    }
  };

  if (createdId) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><p className="eyebrow">Routed to your agency</p><h1>Agency ticket created</h1><p>This ticket skipped citizen validation and entered the Project Head queue directly.</p><code>{createdId}</code><div><Link className="primary-link" href={`/project-head/tickets/${createdId}`}>Open ticket</Link><button className="secondary" type="button" onClick={() => { setCreatedId(undefined); setDescription(""); setEvidence(undefined); }}>Create another</button></div></section>;

  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">W-P9 · Agency originated</p><h1>Create a civic work ticket</h1><p>Record planned or field-identified work without running a citizen validation cycle.</p></div></header>
      <form className="portal-form" onSubmit={(event) => void submit(event)}>
        <section><span className="form-index">01</span><div><h2>Classify the work</h2><p>The category is DB-configured. Future road details can extend this form without replacing it.</p><div className="two-column"><label>Category<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Ward<select required value={wardId} onChange={(event) => setWardId(event.target.value)}><option value="">Select ward</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label></div></div></section>
        <section><span className="form-index">02</span><div><h2>Describe the requirement</h2><label>Description<textarea required minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the issue, planned work, and field context…" /></label></div></section>
        <section><span className="form-index">03</span><div><h2>Add evidence</h2><label className="portal-upload"><strong>{evidence?.name ?? "Choose a photo or PDF"}</strong><span>Required · JPG, PNG, WebP, HEIC, or PDF</span><input required type="file" accept="image/*,application/pdf" onChange={(event) => setEvidence(event.target.files?.[0])} /></label></div></section>
        <section className="form-submit"><span className="form-index">04</span><div><h2>Route to your queue</h2><p>No reporter is attached and no citizen-validation states are created.</p>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !evidence} type="submit">{busy ? "Creating ticket…" : "Create and route ticket"}</button></div></section>
      </form>
    </>
  );
}
