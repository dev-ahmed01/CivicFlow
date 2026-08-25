"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CategorySummary, CitizenTicketSummary, ReportingArea } from "@civicos/shared";
import { CitizenIcon, PrimaryButton, StatusChip } from "./_components/ui";
import { getCitizenAccessToken } from "./_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getCitizenAccessToken();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
    });
  } catch (cause) {
    throw new Error("The CivicFlow API is unavailable. Start the local services and API, then try again.", { cause });
  }
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

async function uploadImage(upload: { uploadUrl: string; headers: Record<string, string> }, file: File, label: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file });
  } catch (cause) {
    throw new Error("Photo storage is unavailable. Run `pnpm infra:up`, then try again.", { cause });
  }
  if (!response.ok) throw new Error(`${label} photo upload failed (${response.status})`);
}

function contentType(file: File): "image/jpeg" | "image/png" | "image/webp" | "image/heic" {
  return ["image/png", "image/webp", "image/heic"].includes(file.type) ? file.type as "image/png" | "image/webp" | "image/heic" : "image/jpeg";
}

export function ReportForm() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [areas, setAreas] = useState<ReportingArea[]>([]);
  const [areaId, setAreaId] = useState("");
  const [primary, setPrimary] = useState<File>();
  const [supporting, setSupporting] = useState<File[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; address: string }>();
  const [locating, setLocating] = useState(false);
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [result, setResult] = useState<CitizenTicketSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      apiFetch<{ categories: CategorySummary[] }>("/categories"),
      apiFetch<{ areas: ReportingArea[] }>("/reporting-areas"),
    ]).then(([categoryBody, areaBody]) => {
      setCategories(categoryBody.categories);
      setAreas(areaBody.areas);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load reporting options"));
  }, []);

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Location access is unavailable. Choose a supported area from the list.");
      return;
    }
    setError(undefined);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        void apiFetch<{ area: ReportingArea }>("/reporting-areas/resolve", { method: "POST", body: JSON.stringify(coordinates) })
          .then(({ area }) => {
            setAreaId(area.id);
            setLocation({ ...coordinates, address: `${area.name}, Bengaluru` });
          })
          .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not verify your location"))
          .finally(() => setLocating(false));
      },
      () => {
        setError("We couldn’t detect your location. Choose a supported area from the list.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8_000 },
    );
  };

  const chooseArea = (nextAreaId: string) => {
    setAreaId(nextAreaId);
    const area = areas.find((item) => item.id === nextAreaId);
    setLocation(area ? { latitude: area.latitude, longitude: area.longitude, address: `${area.name}, Bengaluru` } : undefined);
    setError(undefined);
  };

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
    if (!primary || !categoryId || !location?.address.trim()) return;
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
      await uploadImage(upload, primary, "Main");
      for (const file of supporting) {
        const target = await apiFetch<{ imageId: string; upload: typeof upload }>(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "presign", fileName: file.name, contentType: contentType(file), isPrimary: false }) });
        await uploadImage(target.upload, file, "Supporting");
        await apiFetch(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "complete", imageId: target.imageId }) });
      }
      const completed = await apiFetch<{ needsRetake: true; ticketId: string; message: string } | { needsRetake: false; ticket: CitizenTicketSummary }>(`/tickets/${ticketId}/images`, { method: "POST", body: JSON.stringify({ action: "complete", imageId }) });
      if (completed.needsRetake) { setDraftTicketId(completed.ticketId); setFeedback(completed.message); setPrimary(undefined); setSupporting([]); }
      else { setResult(completed.ticket); setDraftTicketId(undefined); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit report"); }
    finally { setBusy(false); }
  };

  if (result) return <section className="confirmation cf-report-confirmation" aria-live="polite"><span className="success-mark"><CitizenIcon name="check" /></span><p className="eyebrow">Report submitted</p><h2>{result.title}</h2><p className="ticket-id">Ticket No. {result.referenceNumber}</p><ol aria-label="Report progress" className="cf-submission-flow"><li className="done"><span>1</span><div><strong>Report received</strong><small>Your complaint is saved.</small></div></li><li className="current"><span>2</span><div><strong>Community verification</strong><small>Nearby citizens confirm the issue.</small></div></li><li><span>3</span><div><strong>Sent to agency</strong><small>It then appears in the Project Head queue.</small></div></li></ol><StatusChip label={result.statusLabel} /><PrimaryButton type="button" onClick={() => setResult(undefined)}>Report another issue</PrimaryButton></section>;

  return <form className="cf-report-form" id="report-form" onSubmit={(event) => void submit(event)}>
    <header className="cf-form-heading"><span><CitizenIcon name="file" size={28} /></span><div><h2>Report an Issue</h2><p>Help us understand what’s happening.</p></div></header>
    <section className="cf-form-step"><span className="cf-step-number">1</span><div><h3>What’s the issue?</h3><small>Select an issue</small><label className="sr-only" htmlFor="issue-category">Choose an issue category</label><select id="issue-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Choose an issue category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></section>
    <section className="cf-form-step"><span className="cf-step-number">2</span><div><h3>Show us the issue</h3><small>Add up to 3 photos to help city teams verify and understand the issue.</small>
      <label className="cf-upload-zone"><input accept="image/jpeg,image/png" multiple onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))} type="file" /><span><CitizenIcon name="camera" />Add Photos</span><small>Up to 3 photos&nbsp; • &nbsp;JPG, PNG</small></label>
      {previews.length ? <div className="cf-photo-previews">{previews.map(({ file, url }, index) => <div key={`${file.name}-${file.lastModified}`}><Image alt={`Selected evidence ${index + 1}`} height={72} src={url} unoptimized width={108} /><button aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} type="button">×</button></div>)}</div> : null}
      <div className="cf-location-card"><CitizenIcon name="location" /><div className="cf-location-fields"><label><span>Reporting area</span><select required value={areaId} onChange={(event) => chooseArea(event.target.value)}><option value="">Choose an area</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label><span>Address or landmark</span><input disabled={!location} required value={location?.address ?? ""} onChange={(event) => setLocation((current) => current ? { ...current, address: event.target.value } : current)} /></label></div><button disabled={locating} onClick={locate} type="button">{locating ? "Checking…" : "Use my location"}</button></div>
    </div></section>
    {feedback ? <div className="feedback" role="alert"><strong>Let’s try a clearer photo</strong><p>{feedback}</p></div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <button className="cf-submit-report" disabled={busy || !categoryId || !primary || !location?.address.trim()} type="submit">{busy ? "Sending…" : draftTicketId ? "Submit New Photo" : "Submit Report"}<CitizenIcon name="arrow" /></button>
    <p className="cf-form-disclaimer"><CitizenIcon name="lock" size={15} />Your report will be reviewed before being sent to the appropriate city team.</p>
  </form>;
}
