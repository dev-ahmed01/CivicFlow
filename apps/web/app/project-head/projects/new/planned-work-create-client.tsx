"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Category, CivicWork, CivicWorkPriority, EngineerSummary, InterventionPurpose, RoadSegmentSummary, WardSummary } from "@civicos/shared";
import { notifyPortalDataChanged } from "../../../_lib/portal-refresh";
import { apiFetch } from "../../_lib/api";

type WorkCategory = Pick<Category, "id" | "name"> & { roadIntelligenceEnabled: boolean };

function isoDate(value: string, end = false): string {
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}+05:30`).toISOString();
}

export function PlannedWorkCreateClient() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [segments, setSegments] = useState<RoadSegmentSummary[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [wardId, setWardId] = useState("");
  const [priority, setPriority] = useState<CivicWorkPriority>("NORMAL");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [engineerId, setEngineerId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [purpose, setPurpose] = useState<InterventionPurpose>("other");
  const [affectedLengthM, setAffectedLengthM] = useState("100");
  const [startOffsetM, setStartOffsetM] = useState("0");
  const [created, setCreated] = useState<CivicWork>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void Promise.all([
      apiFetch<{ categories: WorkCategory[] }>("/categories"),
      apiFetch<{ wards: WardSummary[] }>("/wards"),
      apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
    ]).then(([categoryResult, wardResult, engineerResult]) => {
      setCategories(categoryResult.categories);
      setWards(wardResult.wards);
      setEngineers(engineerResult.engineers);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load planned-work options"));
  }, []);

  const roadWork = useMemo(() => categories.find(({ id }) => id === categoryId)?.roadIntelligenceEnabled ?? false, [categories, categoryId]);
  useEffect(() => {
    if (!wardId || !roadWork) { setSegments([]); setSegmentId(""); return; }
    void apiFetch<{ segments: RoadSegmentSummary[] }>(`/road-segments?ward=${wardId}`)
      .then((result) => setSegments(result.segments))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load mapped roads"));
  }, [roadWork, wardId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const proposedStart = isoDate(plannedStart);
      const proposedEnd = isoDate(plannedEnd, true);
      const payload = {
        title,
        description,
        categoryId,
        wardId,
        priority,
        proposedStart,
        proposedEnd,
        locationLabel,
        ...(engineerId ? { engineerId } : {}),
        ...(roadWork ? {
          intervention: {
            segmentId,
            purpose,
            plannedStart: proposedStart,
            plannedEnd: proposedEnd,
            affectedLengthM: Number(affectedLengthM),
            startOffsetM: Number(startOffsetM),
            dependencyRefs: [],
          },
        } : { geometry: { type: "Point" as const, coordinates: [Number(longitude), Number(latitude)] } }),
      };
      const result = await apiFetch<{ work: CivicWork }>("/civic-works/planned", { method: "POST", body: JSON.stringify(payload) });
      setCreated(result.work);
      notifyPortalDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not register planned work");
    } finally {
      setBusy(false);
    }
  };

  if (created) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><p className="ph-operational-label">Agency planned work</p><h1>Planned work registered</h1><p>The work is now part of the pipeline and city work map. Conflict warnings remain advisory.</p><code>{created.referenceNumber}</code><div><Link className="primary-link" href={`/project-head/projects/${created.id}`}>Open work record</Link><Link className="secondary-link" href="/project-head/projects">Return to pipeline</Link></div></section>;

  return <div className="ph-planned-work-page">
    <header className="ph-form-heading"><div><Link className="back-link" href="/project-head/projects">← Work Pipeline</Link><p className="ph-operational-label">Agency planning</p><h1>Register Planned Work</h1><p>Create municipal work before a citizen complaint exists. Geometry and dates enter the existing advisory conflict checks immediately.</p></div></header>
    <form className="portal-form ph-planned-work-form" onSubmit={(event) => void submit(event)}>
      <section><span className="form-index">01</span><div><h2>Work definition</h2><p>Use a clear operational title and the configured work category.</p><div className="two-column"><label>Title<input required minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="BTM 14th Main Road resurfacing" /></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as CivicWorkPriority)}>{(["LOW", "NORMAL", "HIGH", "URGENT"] satisfies CivicWorkPriority[]).map((item) => <option key={item}>{item[0]}{item.slice(1).toLowerCase()}</option>)}</select></label><label>Category<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Choose work type</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Responsible Engineer (optional)<select value={engineerId} onChange={(event) => setEngineerId(event.target.value)}><option value="">Assign later</option>{engineers.map((engineer) => <option key={engineer.id} value={engineer.id}>{engineer.email}</option>)}</select></label></div><label>Description<textarea required minLength={10} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Purpose, scope, expected disruption, and restoration responsibility." /></label></div></section>
      <section><span className="form-index">02</span><div><h2>Place and geometry</h2><p>Choose the ward and persist a precise map point or configured road segment.</p><div className="two-column"><label>Ward<select required value={wardId} onChange={(event) => setWardId(event.target.value)}><option value="">Choose ward</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label><label>Location label<input required minLength={3} maxLength={500} value={locationLabel} onChange={(event) => setLocationLabel(event.target.value)} placeholder="BTM Layout, 14th Main Road" /></label>{roadWork ? <><label>Mapped road segment<select required value={segmentId} onChange={(event) => setSegmentId(event.target.value)}><option value="">Choose road segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.roadName}</option>)}</select></label><label>Intervention purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value as InterventionPurpose)}>{(["pipeline", "cable", "OFC", "resurfacing", "other"] satisfies InterventionPurpose[]).map((item) => <option key={item}>{item}</option>)}</select></label><label>Affected length (m)<input required min="1" type="number" value={affectedLengthM} onChange={(event) => setAffectedLengthM(event.target.value)} /></label><label>Start offset (m)<input required min="0" type="number" value={startOffsetM} onChange={(event) => setStartOffsetM(event.target.value)} /></label></> : <><label>Latitude<input required max="90" min="-90" step="any" type="number" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="12.9166" /></label><label>Longitude<input required max="180" min="-180" step="any" type="number" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="77.6101" /></label></>}</div></div></section>
      <section><span className="form-index">03</span><div><h2>Planned window</h2><p>Scheduling is planning only; it does not mark execution as started.</p><div className="two-column"><label>Planned start<input required max={plannedEnd || undefined} type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} /></label><label>Planned end<input required min={plannedStart || undefined} type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></label></div></div></section>
      <div className="ph-form-submit"><div><strong>Advisory checks run on registration</strong><span>Generic spatial/temporal and road sequencing warnings never block submission.</span></div>{error ? <p className="error" role="alert">{error}</p> : null}<button className="portal-primary-button" disabled={busy || (roadWork ? !segmentId : !latitude || !longitude)} type="submit">{busy ? "Registering…" : "Register Planned Work"}</button></div>
    </form>
  </div>;
}
