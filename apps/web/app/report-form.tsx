"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CategorySummary, CitizenTicketSummary } from "@civicos/shared";
import { CategoryGrid, PrimaryButton, StatusChip } from "./_components/ui";
import { getCitizenAccessToken } from "./_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getCitizenAccessToken();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function contentType(file: File): "image/jpeg" | "image/png" | "image/webp" | "image/heic" {
  return ["image/png", "image/webp", "image/heic"].includes(file.type) ? file.type as "image/png" | "image/webp" | "image/heic" : "image/jpeg";
}

export function ReportForm() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [primary, setPrimary] = useState<File>();
  const [supporting, setSupporting] = useState<File[]>([]);
  const [location, setLocation] = useState({ latitude: 12.9352, longitude: 77.6245, address: "" });
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [result, setResult] = useState<CitizenTicketSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => { void apiFetch<{ categories: CategorySummary[] }>("/categories").then((body) => setCategories(body.categories)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load categories")); }, []);
  const locate = () => navigator.geolocation.getCurrentPosition((position) => setLocation((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude })), () => setError("We couldn’t detect your location. You can enter coordinates below."), { enableHighAccuracy: true });

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!primary || !categoryId || !location.address.trim()) return;
    setBusy(true); setError(undefined); setFeedback(undefined);
    try {
      let ticketId = draftTicketId; let imageId: string; let upload: { uploadUrl: string; headers: Record<string, string> };
      if (!ticketId) {
        const category = categories.find((item) => item.id === categoryId)!;
        const created = await apiFetch<{ ticketId: string; imageId: string; upload: typeof upload }>("/tickets", { method: "POST", body: JSON.stringify({ categoryId, title: `${category.name} near ${location.address.split(",")[0]}`, address: location.address, latitude: location.latitude, longitude: location.longitude, primaryImage: { fileName: primary.name, contentType: contentType(primary) } }) });
        ticketId = created.ticketId; imageId = created.imageId; upload = created.upload;
      } else {
        const retake = await apiFetch<{ imageId: string; upload: typeof upload }>(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "presign", fileName: primary.name, contentType: contentType(primary), isPrimary: true }) });
        imageId = retake.imageId; upload = retake.upload;
      }
      const primaryUpload = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: primary });
      if (!primaryUpload.ok) throw new Error("Main photo upload failed");
      for (const file of supporting) {
        const target = await apiFetch<{ imageId: string; upload: typeof upload }>(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "presign", fileName: file.name, contentType: contentType(file), isPrimary: false }) });
        const supportingUpload = await fetch(target.upload.uploadUrl, { method: "PUT", headers: target.upload.headers, body: file });
        if (!supportingUpload.ok) throw new Error("Supporting photo upload failed");
        await apiFetch(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "complete", imageId: target.imageId }) });
      }
      const completed = await apiFetch<{ needsRetake: true; ticketId: string; message: string } | { needsRetake: false; ticket: CitizenTicketSummary }>(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "complete", imageId }) });
      if (completed.needsRetake) { setDraftTicketId(completed.ticketId); setFeedback(completed.message); setPrimary(undefined); }
      else { setResult(completed.ticket); setDraftTicketId(undefined); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit report"); }
    finally { setBusy(false); }
  };

  if (result) return <section className="confirmation" aria-live="polite"><span className="success-mark">✓</span><p className="eyebrow">Report submitted</p><h2>{result.title}</h2><p className="ticket-id">Ticket ID: {result.id}</p><StatusChip label={result.statusLabel} /><PrimaryButton type="button" onClick={() => setResult(undefined)}>Done</PrimaryButton></section>;
  const filtered = categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase()));
  return <form className="report-form" onSubmit={(event) => void submit(event)}>
    <section className="form-section" id="report-category"><div className="step">1</div><div className="section-content"><p className="eyebrow">Issue category</p><h2>What needs attention?</h2><input aria-label="Search categories" placeholder="Search issue types" value={query} onChange={(event) => setQuery(event.target.value)} /><CategoryGrid categories={filtered} selectedId={categoryId} onSelect={(category) => setCategoryId(category.id)} /></div></section>
    <section className="form-section"><div className="step">2</div><div className="section-content"><p className="eyebrow">Photo evidence</p><h2>Show us the issue</h2><label className="upload"><strong>{primary ? primary.name : "Add a clear main photo"}</strong><span>Camera or gallery · required</span><input required type="file" accept="image/*" capture="environment" onChange={(event) => setPrimary(event.target.files?.[0])} /></label><label>Supporting photos (up to 3)<input type="file" accept="image/*" multiple onChange={(event) => setSupporting(Array.from(event.target.files ?? []).slice(0, 3))} /></label></div></section>
    <section className="form-section"><div className="step">3</div><div className="section-content"><p className="eyebrow">Location</p><h2>Confirm the pin</h2><button className="secondary" type="button" onClick={locate}>Use my current location</button><div className="coordinate-row"><label>Latitude<input required type="number" step="any" value={location.latitude} onChange={(event) => setLocation({ ...location, latitude: Number(event.target.value) })} /></label><label>Longitude<input required type="number" step="any" value={location.longitude} onChange={(event) => setLocation({ ...location, longitude: Number(event.target.value) })} /></label></div><label>Address<textarea required value={location.address} onChange={(event) => setLocation({ ...location, address: event.target.value })} placeholder="Street, landmark, ward" /></label><p className="help">Adjust the coordinates if the detected pin is approximate.</p></div></section>
    <section className="form-section"><div className="step">4</div><div className="section-content"><p className="eyebrow">Review</p><h2>Ready to send?</h2><p className="help">Your report will be checked and shared with the community for validation.</p>{feedback ? <div className="feedback" role="alert"><strong>Let’s try a clearer photo</strong><p>{feedback}</p></div> : null}{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || !categoryId || !primary} type="submit">{busy ? "Sending…" : draftTicketId ? "Submit New Photo" : "Submit Report"}</button></div></section>
  </form>;
}
