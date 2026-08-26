"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { InterventionPurpose, RoadConflict, RoadInterventionHistoryItem, RoadSegmentSummary, WardSummary } from "@civicos/shared";
import { notifyPortalDataChanged } from "../../../_lib/portal-refresh";
import { apiFetch, evidenceContentType, uploadFile } from "../../_lib/api";
import { CategoryGrid, PrimaryButton } from "../../../_components/ui";

type UploadTarget = { uploadUrl: string; headers: Record<string, string> };
type RoadAwareCategory = { id: string; name: string; roadIntelligenceEnabled: boolean };

export default function AgencyTicketPage() {
  const [categories, setCategories] = useState<RoadAwareCategory[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [wardId, setWardId] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [createdId, setCreatedId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [roadConflicts, setRoadConflicts] = useState<RoadConflict[]>([]);
  const [segments, setSegments] = useState<RoadSegmentSummary[]>([]);
  const [history, setHistory] = useState<RoadInterventionHistoryItem[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [roadSearch, setRoadSearch] = useState("");
  const [purpose, setPurpose] = useState<InterventionPurpose>("pipeline");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [affectedLengthM, setAffectedLengthM] = useState("100");
  const [startOffsetM, setStartOffsetM] = useState("0");
  const [dependencyRefs, setDependencyRefs] = useState<string[]>([]);
  const roadEnabled = categories.find((category) => category.id === categoryId)?.roadIntelligenceEnabled === true;

  useEffect(() => {
    void Promise.all([apiFetch<{ categories: RoadAwareCategory[] }>("/categories"), apiFetch<{ wards: WardSummary[] }>("/wards")])
      .then(([categoryResult, wardResult]) => { setCategories(categoryResult.categories); setWards(wardResult.wards); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the form"));
  }, []);

  useEffect(() => {
    if (!roadEnabled || !wardId) { setSegments([]); setSegmentId(""); return; }
    const query = new URLSearchParams({ ward: wardId });
    if (roadSearch.trim()) query.set("query", roadSearch.trim());
    void apiFetch<{ segments: RoadSegmentSummary[] }>(`/road-segments?${query.toString()}`)
      .then((result) => setSegments(result.segments))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load road segments"));
  }, [roadEnabled, roadSearch, wardId]);

  useEffect(() => {
    if (!segmentId) { setHistory([]); return; }
    void apiFetch<{ interventionHistory: RoadInterventionHistoryItem[] }>(`/road-segments/${segmentId}`)
      .then((result) => setHistory(result.interventionHistory))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load intervention history"));
  }, [segmentId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!evidence) return;
    setBusy(true);
    setError(undefined);
    try {
      const intervention = roadEnabled ? {
        segmentId,
        purpose,
        plannedStart: `${plannedStart}T00:00:00.000Z`,
        plannedEnd: `${plannedEnd}T23:59:59.999Z`,
        affectedLengthM: Number(affectedLengthM),
        startOffsetM: Number(startOffsetM),
        dependencyRefs,
      } : undefined;
      const created = await apiFetch<{ ticketId: string; imageId: string; upload: UploadTarget; projectId: string | null; roadConflicts: RoadConflict[] }>("/tickets/agency-originated", {
        method: "POST",
        body: JSON.stringify({ action: "create", categoryId, wardId, description, evidence: { fileName: evidence.name, contentType: evidenceContentType(evidence) }, intervention }),
      });
      await uploadFile(created.upload, evidence);
      await apiFetch("/tickets/agency-originated", { method: "POST", body: JSON.stringify({ action: "complete", imageId: created.imageId }) });
      setCreatedId(created.ticketId);
      setProjectId(created.projectId ?? undefined);
      setRoadConflicts(created.roadConflicts);
      notifyPortalDataChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create ticket");
    } finally {
      setBusy(false);
    }
  };

  if (createdId) return <section className="portal-panel completion-panel"><span className="success-mark">✓</span><p className="eyebrow">Routed to your agency</p><h1>{projectId ? "Planned intervention created" : "Agency ticket created"}</h1><p>{projectId ? `The project and intervention were saved. ${roadConflicts.length} advisory road warning${roadConflicts.length === 1 ? "" : "s"} detected; none blocked creation.` : "This ticket skipped citizen validation and entered the Project Head queue directly."}</p><code>{projectId ?? createdId}</code><div>{projectId ? <Link className="primary-link" href={`/project-head/projects/${projectId}`}>Review road intelligence</Link> : <Link className="primary-link" href={`/project-head/tickets/${createdId}`}>Open ticket</Link>}<button className="secondary" type="button" onClick={() => { setCreatedId(undefined); setProjectId(undefined); setRoadConflicts([]); setDescription(""); setEvidence(undefined); }}>Create another</button></div></section>;

  return <><header className="portal-heading"><div><p className="eyebrow">W-P9 · Agency originated</p><h1>Create a civic work ticket</h1><p>Record planned or field-identified work without running a citizen validation cycle.</p></div></header><form className="portal-form" onSubmit={(event) => void submit(event)}>
    <section><span className="form-index">01</span><div><h2>Classify the work</h2><p>The category and road-cutting intelligence binding are DB-configured.</p><label>Category</label><CategoryGrid categories={categories} selectedId={categoryId} onSelect={(category) => setCategoryId(category.id)} /><div className="two-column"><label>Ward<select required value={wardId} onChange={(event) => setWardId(event.target.value)}><option value="">Select ward</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label></div></div></section>
    {roadEnabled ? <section className="road-work-section"><span className="form-index">02</span><div><h2>Road intervention</h2><p>Choose the exact segment and planned chainage. All warnings remain advisory.</p><div className="two-column"><label>Search road name<input value={roadSearch} onChange={(event) => setRoadSearch(event.target.value)} placeholder="e.g. 80 Feet Road" /></label><label>Road segment<select required value={segmentId} onChange={(event) => { setSegmentId(event.target.value); setDependencyRefs([]); }}><option value="">Search by road name / selected ward</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.roadName} · {segment.ward.name}</option>)}</select></label><label>Purpose<select required value={purpose} onChange={(event) => setPurpose(event.target.value as InterventionPurpose)}>{(["pipeline", "cable", "OFC", "resurfacing", "other"] satisfies InterventionPurpose[]).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Planned start<input required type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} /></label><label>Planned end<input required type="date" min={plannedStart} value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></label><label>Start offset (m)<input required min="0" step="1" type="number" value={startOffsetM} onChange={(event) => setStartOffsetM(event.target.value)} /></label><label>Affected length (m)<input required min="1" step="1" type="number" value={affectedLengthM} onChange={(event) => setAffectedLengthM(event.target.value)} /></label></div>{history.length ? <fieldset className="intervention-dependencies"><legend>Declared intervention dependencies</legend>{history.map((item) => <label key={item.id}><input type="checkbox" checked={dependencyRefs.includes(item.id)} onChange={(event) => setDependencyRefs((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{item.requestingAgency.name} · {item.purpose} · {new Date(item.plannedStart).toLocaleDateString("en-IN")}</span></label>)}</fieldset> : <p className="portal-muted">No earlier interventions are recorded on this segment.</p>}</div></section> : null}
    <section><span className="form-index">{roadEnabled ? "03" : "02"}</span><div><h2>Describe the requirement</h2><label>Description<textarea required minLength={10} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the issue, planned work, and field context…" /></label></div></section>
    <section><span className="form-index">{roadEnabled ? "04" : "03"}</span><div><h2>Add evidence</h2><label className="portal-upload"><strong>{evidence?.name ?? "Choose a photo or PDF"}</strong><span>Required · JPG, PNG, WebP, HEIC, or PDF</span><input required type="file" accept="image/*,application/pdf" onChange={(event) => setEvidence(event.target.files?.[0])} /></label></div></section>
    <section className="form-submit"><span className="form-index">{roadEnabled ? "05" : "04"}</span><div><h2>{roadEnabled ? "Create planned intervention" : "Route to your queue"}</h2><p>{roadEnabled ? "The project and intervention are created together; Continue anyway is always available after advisory checks." : "No reporter is attached and no citizen-validation states are created."}</p>{error ? <p className="error" role="alert">{error}</p> : null}<PrimaryButton disabled={busy || !evidence || (roadEnabled && (!segmentId || !plannedStart || !plannedEnd))} type="submit">{busy ? "Creating…" : roadEnabled ? "Create project · Continue anyway" : "Create and route ticket"}</PrimaryButton></div></section>
  </form></>;
}
