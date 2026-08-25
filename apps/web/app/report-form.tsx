"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CategorySummary, CitizenTicketSummary } from "@civicos/shared";
import { CitizenIcon, PrimaryButton, StatusChip } from "./_components/ui";
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
  const [primary, setPrimary] = useState<File>();
  const [supporting, setSupporting] = useState<File[]>([]);
  const [location, setLocation] = useState({ latitude: 12.9299, longitude: 77.5844, address: "Jayanagar, Bengaluru" });
  const [locating, setLocating] = useState(false);
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [result, setResult] = useState<CitizenTicketSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void apiFetch<{ categories: CategorySummary[] }>("/categories").then((body) => setCategories(body.categories)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load categories"));
  }, []);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude }));
        setLocating(false);
      },
      () => {
        setError("We couldn’t detect your location, so the demo pin remains selected. Confirm the address before submitting.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  };

  useEffect(() => { locate(); }, []);

  const files = useMemo(() => primary ? [primary, ...supporting] : supporting, [primary, supporting]);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  const chooseFiles = (selected: File[]) => {
    const next = selected.slice(0, 3);
    setPrimary(next[0]);
    setSupporting(next.slice(1));
  };

  const removeFile = (index: number) => {
    const next = files.filter((_file, fileIndex) => fileIndex !== index);
    setPrimary(next[0]);
    setSupporting(next.slice(1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!primary || !categoryId || !location.address.trim()) return;
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
      if (completed.needsRetake) { setDraftTicketId(completed.ticketId); setFeedback(completed.message); setPrimary(undefined); setSupporting([]); }
      else { setResult(completed.ticket); setDraftTicketId(undefined); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit report"); }
    finally { setBusy(false); }
  };

  if (result) return <section className="confirmation cf-report-confirmation" aria-live="polite"><span className="success-mark"><CitizenIcon name="check" /></span><p className="eyebrow">Report submitted</p><h2>{result.title}</h2><p className="ticket-id">Ticket ID: {result.id}</p><StatusChip label={result.statusLabel} /><PrimaryButton type="button" onClick={() => setResult(undefined)}>Report another issue</PrimaryButton></section>;

  return <form className="cf-report-form" id="report-form" onSubmit={(event) => void submit(event)}>
    <header className="cf-form-heading"><span><CitizenIcon name="file" size={28} /></span><div><h2>Report an Issue</h2><p>Help us understand what’s happening.</p></div></header>
    <section className="cf-form-step"><span className="cf-step-number">1</span><div><h3>What’s the issue?</h3><small>Select an issue</small><label className="sr-only" htmlFor="issue-category">Choose an issue category</label><select id="issue-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Choose an issue category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></section>
    <section className="cf-form-step"><span className="cf-step-number">2</span><div><h3>Show us the issue</h3><small>Add up to 3 photos to help city teams verify and understand the issue.</small>
      <label className="cf-upload-zone"><input accept="image/jpeg,image/png" multiple onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))} type="file" /><span><CitizenIcon name="camera" />Add Photos</span><small>Up to 3 photos&nbsp; • &nbsp;JPG, PNG</small></label>
      {previews.length ? <div className="cf-photo-previews">{previews.map(({ file, url }, index) => <div key={`${file.name}-${file.lastModified}`}><Image alt={`Selected evidence ${index + 1}`} height={72} src={url} unoptimized width={108} /><button aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} type="button">×</button></div>)}</div> : null}
      <div className="cf-location-row"><CitizenIcon name="location" /><label><span>Report location</span><input required value={location.address} onChange={(event) => setLocation({ ...location, address: event.target.value })} /></label><button onClick={locate} type="button">{locating ? "Locating…" : "Refresh pin"}</button></div>
    </div></section>
    {feedback ? <div className="feedback" role="alert"><strong>Let’s try a clearer photo</strong><p>{feedback}</p></div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <button className="cf-submit-report" disabled={busy || !categoryId || !primary || !location.address.trim()} type="submit">{busy ? "Sending…" : draftTicketId ? "Submit New Photo" : "Submit Report"}<CitizenIcon name="arrow" /></button>
    <p className="cf-form-disclaimer"><CitizenIcon name="lock" size={15} />Your report will be reviewed before being sent to the appropriate city team.</p>
  </form>;
}
